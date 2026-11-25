"""Construtores de dados de teste conforme leiautes oficiais.

São respostas REPRESENTATIVAS para testes automatizados. Não substituem a
validação em homologação/produção com certificado real.
"""
import base64
import gzip
from datetime import datetime, timedelta, timezone as dt_tz

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

from monitor_fiscal.clientes.transporte import ComunicacaoError, RespostaHTTP

NS_NFE = 'http://www.portalfiscal.inf.br/nfe'
NS_CTE = 'http://www.portalfiscal.inf.br/cte'
NS_NFSE = 'http://www.sped.fazenda.gov.br/nfse'

_CHAVE_RSA = None


def _chave_rsa():
    global _CHAVE_RSA
    if _CHAVE_RSA is None:
        _CHAVE_RSA = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return _CHAVE_RSA


def gerar_pfx(cnpj='11222333000181', senha='1234', dias_validade=365, vencido=False, nome='EMPRESA TESTE LTDA'):
    chave = _chave_rsa()
    agora = datetime.now(dt_tz.utc)
    if vencido:
        inicio, fim = agora - timedelta(days=400), agora - timedelta(days=1)
    else:
        inicio, fim = agora - timedelta(days=1), agora + timedelta(days=dias_validade)
    # OtherName ICP-Brasil 2.16.76.1.3.3 (CNPJ) codificado como OCTET STRING.
    valor = bytes([0x04, len(cnpj)]) + cnpj.encode()
    emissor = x509.Name([x509.NameAttribute(NameOID.ORGANIZATION_NAME, 'ICP-Brasil'),
                         x509.NameAttribute(NameOID.COMMON_NAME, 'AC TESTE')])
    sujeito = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, f'{nome}:{cnpj}')])
    cert = (
        x509.CertificateBuilder().subject_name(sujeito).issuer_name(emissor).public_key(chave.public_key())
        .serial_number(x509.random_serial_number()).not_valid_before(inicio).not_valid_after(fim)
        .add_extension(x509.SubjectAlternativeName([
            x509.OtherName(x509.ObjectIdentifier('2.16.76.1.3.3'), valor)]), critical=False)
        .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.CLIENT_AUTH]), critical=False)
        .sign(chave, hashes.SHA256())
    )
    return pkcs12.serialize_key_and_certificates(
        b'teste', chave, cert, None, serialization.BestAvailableEncryption(senha.encode())
    ), cert


def dv_chave(chave43):
    pesos = [2, 3, 4, 5, 6, 7, 8, 9]
    soma = sum(int(d) * pesos[i % 8] for i, d in enumerate(reversed(chave43)))
    resto = soma % 11
    return '0' if resto in (0, 1) else str(11 - resto)


def chave(cnpj_emit='99888777000100', numero=1, modelo='55', serie=1, uf='32', aamm='2611', cnf='12345678'):
    base = f'{uf}{aamm}{cnpj_emit}{modelo}{serie:03d}{numero:09d}1{cnf}'
    return base + dv_chave(base)


def res_nfe(ch, cnpj_emit='99888777000100', valor='1500.00', situacao='1', dh='2026-11-20T10:00:00-03:00'):
    return f'''<resNFe xmlns="{NS_NFE}" versao="1.01"><chNFe>{ch}</chNFe><CNPJ>{cnpj_emit}</CNPJ>
<xNome>FORNECEDOR SA</xNome><IE>123456</IE><dhEmi>{dh}</dhEmi><tpNF>1</tpNF><vNF>{valor}</vNF>
<digVal>abc=</digVal><dhRecbto>{dh}</dhRecbto><nProt>132260000000001</nProt><cSitNFe>{situacao}</cSitNFe></resNFe>'''.encode()


def nfe_proc(ch, cnpj_emit='99888777000100', cnpj_dest='11222333000181', tp_amb='1', valor='1500.00',
             itens=None, protocolo=True, dh='2026-11-20T10:00:00-03:00'):
    itens = itens or [('PROD1', 'PRODUTO A', '84713012', '5102', '10.0000', '150.0000', '1500.00')]
    dets = ''.join(
        f'<det nItem="{i}"><prod><cProd>{c}</cProd><cEAN>SEM GTIN</cEAN><xProd>{d}</xProd><NCM>{n}</NCM>'
        f'<CFOP>{cf}</CFOP><uCom>UN</uCom><qCom>{q}</qCom><vUnCom>{vu}</vUnCom><vProd>{vt}</vProd></prod>'
        f'<imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST><vBC>{vt}</vBC><pICMS>12.00</pICMS><vICMS>18.00</vICMS>'
        f'</ICMS00></ICMS></imposto></det>'
        for i, (c, d, n, cf, q, vu, vt) in enumerate(itens, start=1)
    )
    prot = (f'<protNFe versao="4.00"><infProt><tpAmb>{tp_amb}</tpAmb><chNFe>{ch}</chNFe><dhRecbto>{dh}</dhRecbto>'
            f'<nProt>132260000000001</nProt><cStat>100</cStat></infProt></protNFe>') if protocolo else ''
    return f'''<nfeProc xmlns="{NS_NFE}" versao="4.00"><NFe><infNFe Id="NFe{ch}" versao="4.00"><ide><cUF>32</cUF>
<natOp>VENDA</natOp><mod>55</mod><serie>1</serie><nNF>{int(ch[25:34])}</nNF><dhEmi>{dh}</dhEmi><tpNF>1</tpNF>
<tpAmb>{tp_amb}</tpAmb><finNFe>1</finNFe></ide><emit><CNPJ>{cnpj_emit}</CNPJ><xNome>FORNECEDOR SA</xNome>
<enderEmit><cMun>3205309</cMun><xMun>Vitoria</xMun><UF>ES</UF></enderEmit><IE>123456</IE></emit>
<dest><CNPJ>{cnpj_dest}</CNPJ><xNome>EMPRESA TESTE LTDA</xNome></dest>{dets}
<total><ICMSTot><vBC>{valor}</vBC><vICMS>18.00</vICMS><vProd>{valor}</vProd><vNF>{valor}</vNF></ICMSTot></total>
<transp><modFrete>0</modFrete></transp></infNFe></NFe>{prot}</nfeProc>'''.encode()


def proc_evento_nfe(ch, tp_evento='110111', seq=1, autor='99888777000100', tp_amb='1', desc='Cancelamento'):
    return f'''<procEventoNFe xmlns="{NS_NFE}" versao="1.00"><evento versao="1.00"><infEvento Id="ID{tp_evento}{ch}{seq:02d}">
<cOrgao>32</cOrgao><tpAmb>{tp_amb}</tpAmb><CNPJ>{autor}</CNPJ><chNFe>{ch}</chNFe><dhEvento>2026-11-21T10:00:00-03:00</dhEvento>
<tpEvento>{tp_evento}</tpEvento><nSeqEvento>{seq}</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00">
<descEvento>{desc}</descEvento><nProt>132260000000001</nProt><xJust>Erro na emissao do documento</xJust></detEvento></infEvento></evento>
<retEvento versao="1.00"><infEvento><tpAmb>{tp_amb}</tpAmb><cStat>135</cStat><xMotivo>Evento registrado e vinculado a NF-e</xMotivo>
<chNFe>{ch}</chNFe><tpEvento>{tp_evento}</tpEvento><nSeqEvento>{seq}</nSeqEvento><dhRegEvento>2026-11-21T10:00:05-03:00</dhRegEvento>
<nProt>132260000000099</nProt></infEvento></retEvento></procEventoNFe>'''.encode()


def res_evento(ch, tp_evento='110111', seq=1, autor='99888777000100'):
    return f'''<resEvento xmlns="{NS_NFE}" versao="1.01"><cOrgao>32</cOrgao><CNPJ>{autor}</CNPJ><chNFe>{ch}</chNFe>
<dhEvento>2026-11-21T10:00:00-03:00</dhEvento><tpEvento>{tp_evento}</tpEvento><nSeqEvento>{seq}</nSeqEvento>
<xEvento>Cancelamento</xEvento><dhRecbto>2026-11-21T10:00:05-03:00</dhRecbto><nProt>132260000000099</nProt></resEvento>'''.encode()


def cte_proc(ch, cnpj_emit='55444333000122', cnpj_rem='99888777000100', cnpj_dest='11222333000181', toma='3'):
    return f'''<cteProc xmlns="{NS_CTE}" versao="4.00"><CTe><infCte Id="CTe{ch}" versao="4.00"><ide><cUF>32</cUF><CFOP>5353</CFOP>
<natOp>PRESTACAO</natOp><mod>57</mod><serie>1</serie><nCT>{int(ch[25:34])}</nCT><dhEmi>2026-11-20T10:00:00-03:00</dhEmi>
<tpAmb>1</tpAmb><tpCTe>0</tpCTe><cMunIni>3205309</cMunIni><xMunIni>Vitoria</xMunIni><UFIni>ES</UFIni><cMunFim>3550308</cMunFim>
<xMunFim>Sao Paulo</xMunFim><UFFim>SP</UFFim><modal>01</modal><toma3><toma>{toma}</toma></toma3></ide>
<emit><CNPJ>{cnpj_emit}</CNPJ><IE>1</IE><xNome>TRANSPORTADORA</xNome></emit><rem><CNPJ>{cnpj_rem}</CNPJ><xNome>REMETENTE</xNome></rem>
<dest><CNPJ>{cnpj_dest}</CNPJ><xNome>DESTINATARIO</xNome></dest><vPrest><vTPrest>350.00</vTPrest><vRec>350.00</vRec></vPrest>
<imp><ICMS><ICMS00><CST>00</CST><vBC>350.00</vBC><pICMS>12.00</pICMS><vICMS>42.00</vICMS></ICMS00></ICMS></imp>
<infCTeNorm><infDoc><infNFe><chave>{'1' * 44}</chave></infNFe></infDoc></infCTeNorm></infCte></CTe>
<protCTe versao="4.00"><infProt><tpAmb>1</tpAmb><chCTe>{ch}</chCTe><dhRecbto>2026-11-20T10:00:00-03:00</dhRecbto>
<nProt>332260000000001</nProt><cStat>100</cStat></infProt></protCTe></cteProc>'''.encode()


def chave_nfse(numero=1):
    return f'3205309{1}{"11222333000181"}{numero:013d}{"1"}{"123456789"}0'[:50].ljust(50, '0')


def nfse(ch, prestador='11222333000181', tomador='77666555000144', intermediario=None, subst='', tp_amb='1'):
    interm = f'<interm><CNPJ>{intermediario}</CNPJ><xNome>INTERMEDIARIO</xNome></interm>' if intermediario else ''
    sub = f'<subst><chSubstda>{subst}</chSubstda><cMotivo>01</cMotivo></subst>' if subst else ''
    return f'''<NFSe xmlns="{NS_NFSE}" versao="1.00"><infNFSe Id="NFS{ch}"><xLocEmi>Vitoria</xLocEmi><xLocPrestacao>Vitoria</xLocPrestacao>
<nNFSe>{int(ch[-20:-10] or 1)}</nNFSe><cLocIncid>3205309</cLocIncid><xLocIncid>Vitoria</xLocIncid><nDFSe>123</nDFSe>
<dhProc>2026-11-20T10:00:00-03:00</dhProc><cStat>100</cStat><emit><CNPJ>{prestador}</CNPJ><xNome>PRESTADOR</xNome></emit>
<valores><vBC>1000.00</vBC><pAliqAplic>5.00</pAliqAplic><vISSQN>50.00</vISSQN><vTotalRet>0.00</vTotalRet><vLiq>1000.00</vLiq></valores>
<DPS versao="1.00"><infDPS Id="DPS1"><tpAmb>{tp_amb}</tpAmb><dhEmi>2026-11-20T10:00:00-03:00</dhEmi><serie>1</serie><nDPS>1</nDPS>
<dCompet>2026-11-01</dCompet>{sub}<prest><CNPJ>{prestador}</CNPJ></prest><toma><CNPJ>{tomador}</CNPJ><xNome>TOMADOR</xNome></toma>{interm}
<serv><locPrest><cLocPrestacao>3205309</cLocPrestacao></locPrest><cServ><cTribNac>010101</cTribNac><xDescServ>Consultoria</xDescServ></cServ></serv>
<valores><vServPrest><vServ>1000.00</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun></trib></valores>
</infDPS></DPS></infNFSe></NFSe>'''.encode()


def evento_nfse(ch, tipo='101101', subst=''):
    det = f'<chSubstituta>{subst}</chSubstituta>' if subst else ''
    return f'''<evento xmlns="{NS_NFSE}" versao="1.00"><infEvento Id="EVT{ch}{tipo}001"><dhProc>2026-11-22T10:00:00-03:00</dhProc>
<nDFe>456</nDFe><pedRegEvento versao="1.00"><infPedReg Id="PRE{ch}{tipo}001"><tpAmb>1</tpAmb><verAplic>1</verAplic>
<dhEvento>2026-11-22T10:00:00-03:00</dhEvento><CNPJAutor>11222333000181</CNPJAutor><chNFSe>{ch}</chNFSe><nPedRegEvento>1</nPedRegEvento>
<e{tipo}><xDesc>Evento</xDesc><cMotivo>1</cMotivo><xMotivo>Erro</xMotivo>{det}</e{tipo}></infPedReg></pedRegEvento></infEvento></evento>'''.encode()


def gz64(conteudo: bytes) -> str:
    return base64.b64encode(gzip.compress(conteudo)).decode()


def soap_ret_dist(cstat, motivo='', ult='000000000000000', maximo='000000000000000', docs=(), ns=NS_NFE,
                  versao='1.01'):
    lote = ''
    if docs:
        lote = '<loteDistDFeInt>' + ''.join(
            f'<docZip NSU="{nsu}" schema="{schema}">{gz64(xml)}</docZip>' for nsu, schema, xml in docs
        ) + '</loteDistDFeInt>'
    return f'''<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
<soap:Body><nfeDistDFeInteresseResponse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDistDFeInteresseResult>
<retDistDFeInt xmlns="{ns}" versao="{versao}"><tpAmb>1</tpAmb><verAplic>1.0</verAplic><cStat>{cstat}</cStat><xMotivo>{motivo}</xMotivo>
<dhResp>2026-11-24T10:00:00-03:00</dhResp><ultNSU>{ult}</ultNSU><maxNSU>{maximo}</maxNSU>{lote}</retDistDFeInt>
</nfeDistDFeInteresseResult></nfeDistDFeInteresseResponse></soap:Body></soap:Envelope>'''


def soap_ret_evento(cstat_lote='128', cstat='135', motivo='Evento registrado e vinculado a NF-e', ch='', tp='210210'):
    return f'''<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>
<nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4"><retEnvEvento xmlns="{NS_NFE}" versao="1.00">
<idLote>1</idLote><tpAmb>1</tpAmb><verAplic>AN</verAplic><cOrgao>91</cOrgao><cStat>{cstat_lote}</cStat><xMotivo>Lote processado</xMotivo>
<retEvento versao="1.00"><infEvento><tpAmb>1</tpAmb><verAplic>AN</verAplic><cOrgao>91</cOrgao><cStat>{cstat}</cStat>
<xMotivo>{motivo}</xMotivo><chNFe>{ch}</chNFe><tpEvento>{tp}</tpEvento><xEvento>Ciencia da Operacao registrada</xEvento>
<nSeqEvento>1</nSeqEvento><dhRegEvento>2026-11-24T10:00:00-03:00</dhRegEvento><nProt>891260000000001</nProt></infEvento></retEvento>
</retEnvEvento></nfeResultMsg></soap:Body></soap:Envelope>'''


class TransporteFalso:
    """Devolve respostas pré-definidas e registra as requisições."""

    def __init__(self, respostas):
        self.respostas = list(respostas)
        self.requisicoes = []

    def _proxima(self):
        if not self.respostas:
            raise AssertionError('Requisição inesperada: nenhuma resposta configurada.')
        resposta = self.respostas.pop(0)
        if isinstance(resposta, Exception):
            raise resposta
        if isinstance(resposta, tuple):
            status, texto = resposta
        else:
            status, texto = 200, resposta
        return RespostaHTTP(status=status, texto=texto, conteudo=texto.encode('utf-8'))

    def post(self, url, corpo, headers):
        self.requisicoes.append({'metodo': 'POST', 'url': url, 'corpo': corpo, 'headers': headers})
        return self._proxima()

    def get(self, url, params=None, headers=None):
        self.requisicoes.append({'metodo': 'GET', 'url': url, 'params': params})
        return self._proxima()


FalhaRede = ComunicacaoError
