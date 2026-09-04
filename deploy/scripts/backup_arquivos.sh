#!/usr/bin/env bash
set -Eeuo pipefail

CLOUD_MEDIA_ROOT="${CLOUD_MEDIA_ROOT:-/srv/sistema-inovar/arquivos}"
PHYSICAL_BACKUP_ROOT="${PHYSICAL_BACKUP_ROOT:-/mnt/servidor-inovar/SISTEMA INOVAR}"
BACKUP_STATE_ROOT="${BACKUP_STATE_ROOT:-/srv/sistema-inovar/backup-database}"
BACKUP_LOG_ROOT="${BACKUP_LOG_ROOT:-/srv/sistema-inovar/logs-backup}"
BACKUP_LOCK_FILE="${BACKUP_LOCK_FILE:-/run/lock/sistema-inovar-backup.lock}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-35}"

timestamp="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_STATE_ROOT" "$BACKUP_LOG_ROOT"
log_file="$BACKUP_LOG_ROOT/backup_${timestamp}.log"
exec > >(tee -a "$log_file") 2>&1

exec 9>"$BACKUP_LOCK_FILE"
if ! flock -n 9; then
    echo "Já existe um backup em execução."
    exit 75
fi

echo "Início do backup: $(date --iso-8601=seconds)"

if [[ ! -d "$CLOUD_MEDIA_ROOT" || "$CLOUD_MEDIA_ROOT" == "/" ]]; then
    echo "Origem inválida: $CLOUD_MEDIA_ROOT"
    exit 2
fi
if [[ "$PHYSICAL_BACKUP_ROOT" == "/" || "$PHYSICAL_BACKUP_ROOT" == "/mnt" ]]; then
    echo "Destino inseguro: $PHYSICAL_BACKUP_ROOT"
    exit 2
fi
destination_fstypes="$(findmnt -T "$PHYSICAL_BACKUP_ROOT" -n -o FSTYPE 2>/dev/null || true)"
if ! grep -Eq '^(cifs|smb3)$' <<< "$destination_fstypes"; then
    destination_fstypes_display="$(tr '\n' ',' <<< "$destination_fstypes" | sed 's/,$//')"
    echo "O destino não pertence a um compartilhamento CIFS/SMB montado: $PHYSICAL_BACKUP_ROOT (tipos: ${destination_fstypes_display:-desconhecido})"
    exit 3
fi
if [[ "$(realpath "$CLOUD_MEDIA_ROOT")" == "$(realpath "$PHYSICAL_BACKUP_ROOT")" ]]; then
    echo "Origem e destino são iguais."
    exit 2
fi

probe="$PHYSICAL_BACKUP_ROOT/.sistema-inovar-backup-write-test-${timestamp}"
if ! (umask 077 && : > "$probe"); then
    echo "O destino não permite escrita."
    exit 4
fi
rm -f -- "$probe"

database_file="$BACKUP_STATE_ROOT/sistema_inovar_${timestamp}.dump"
if [[ -n "${POSTGRES_DB:-}" && -n "${POSTGRES_USER:-}" ]]; then
    echo "Gerando backup do PostgreSQL."
    PGPASSWORD="${POSTGRES_PASSWORD:-}" pg_dump \
        --format=custom \
        --no-password \
        --host="${POSTGRES_HOST:-127.0.0.1}" \
        --port="${POSTGRES_PORT:-5432}" \
        --username="$POSTGRES_USER" \
        --file="$database_file.part" \
        "$POSTGRES_DB"
    mv -- "$database_file.part" "$database_file"
else
    echo "Variáveis do PostgreSQL ausentes; o backup não continuará incompleto."
    exit 5
fi

version_root="$PHYSICAL_BACKUP_ROOT/_VERSOES/$timestamp"
database_destination="$PHYSICAL_BACKUP_ROOT/_BACKUP_BANCO"
mkdir -p "$version_root" "$database_destination"

rsync_options=(
    --archive
    --human-readable
    --itemize-changes
    --partial
    --protect-args
    --no-links
    --backup
)

echo "Sincronizando arquivos existentes diretamente na raiz."
find "$CLOUD_MEDIA_ROOT" -mindepth 1 -maxdepth 1 -type f -printf '%f\0' \
    | rsync "${rsync_options[@]}" --from0 --files-from=- \
        --backup-dir="$version_root/_RAIZ" \
        "$CLOUD_MEDIA_ROOT/" "$PHYSICAL_BACKUP_ROOT/"

echo "Sincronizando documentos novos e alterados, uma empresa por vez."
while IFS= read -r -d '' company_directory; do
    company_name="$(basename "$company_directory")"
    echo "Empresa: $company_name"
    destination_directory="$PHYSICAL_BACKUP_ROOT/$company_name"
    mkdir -p "$destination_directory"
    rsync "${rsync_options[@]}" \
        --backup-dir="$version_root/$company_name" \
        "$company_directory/" "$destination_directory/"
done < <(find "$CLOUD_MEDIA_ROOT" -mindepth 1 -maxdepth 1 -type d -print0 | sort -z)

echo "Copiando backup do banco de dados."
rsync --archive --partial --protect-args "$database_file" "$database_destination/"

# Remove somente dumps locais antigos já destinados à sincronização. O acervo de
# documentos e a cópia física nunca são removidos por esta rotina.
find "$BACKUP_STATE_ROOT" -maxdepth 1 -type f -name 'sistema_inovar_*.dump' \
    -mtime "+$BACKUP_RETENTION_DAYS" -delete

echo "Backup concluído: $(date --iso-8601=seconds)"
