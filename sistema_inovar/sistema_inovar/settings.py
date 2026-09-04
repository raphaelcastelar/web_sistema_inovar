from datetime import timedelta
from pathlib import Path

from decouple import config


BASE_DIR = Path(__file__).resolve().parent.parent


def csv_config(name, default=''):
    value = config(name, default=default)
    return [item.strip() for item in value.split(',') if item.strip()]


def bool_config(name, default=False):
    default_value = 'true' if default else 'false'
    value = str(config(name, default=default_value)).strip().lower()
    if value in ('1', 'true', 'yes', 'on'):
        return True
    if value in ('0', 'false', 'no', 'off', 'release', 'prod', 'production'):
        return False
    return default


SECRET_KEY = config('SECRET_KEY', default='django-insecure-local-dev-only-change-me')
DEBUG = bool_config('DEBUG', default=False)

ALLOWED_HOSTS = csv_config('ALLOWED_HOSTS', default='localhost,127.0.0.1')
CSRF_TRUSTED_ORIGINS = csv_config('CSRF_TRUSTED_ORIGINS')

CORS_ALLOW_ALL_ORIGINS = bool_config('CORS_ALLOW_ALL_ORIGINS', default=False)
CORS_ALLOWED_ORIGINS = csv_config(
    'CORS_ALLOWED_ORIGINS',
    default='http://localhost:3000,http://127.0.0.1:3000',
)


INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt',
    'empresas',
    'corsheaders',
    'django_filters',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'sistema_inovar.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'sistema_inovar.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('POSTGRES_DB', default='sistema_inovar_web'),
        'USER': config('POSTGRES_USER', default='postgres'),
        'PASSWORD': config('POSTGRES_PASSWORD', default=''),
        'HOST': config('POSTGRES_HOST', default='127.0.0.1'),
        'PORT': config('POSTGRES_PORT', default='5432'),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=5),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    'ROTATE_REFRESH_TOKENS': False,
    'BLACKLIST_AFTER_ROTATION': False,
}

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = config('STATIC_ROOT', default=str(BASE_DIR / 'staticfiles'))

MEDIA_URL = '/media/'
MEDIA_ROOT = config('MEDIA_ROOT', default=str(BASE_DIR / 'media'))

# Caminhos do armazenamento principal na Droplet e do backup físico. MEDIA_ROOT
# continua sendo a configuração que determina onde a aplicação opera.
CLOUD_MEDIA_ROOT = config('CLOUD_MEDIA_ROOT', default='/srv/sistema-inovar/arquivos')
PHYSICAL_BACKUP_ROOT = config(
    'PHYSICAL_BACKUP_ROOT',
    default='/mnt/servidor-inovar/SISTEMA INOVAR',
)

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
AUTH_USER_MODEL = 'empresas.Funcionario'

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
}

EMAIL_REMETENTE = config('EMAIL_REMETENTE', default='default_email@example.com')
EMAIL_SENHA_APP = config('EMAIL_SENHA_APP', default='')

SERPRO_CONSUMER_KEY = config('SERPRO_CONSUMER_KEY', default='')
SERPRO_CONSUMER_SECRET = config('SERPRO_CONSUMER_SECRET', default='')
SERPRO_CERT_PASSWORD = config('SERPRO_CERT_PASSWORD', default='')
SERPRO_AUTH_URL = config('SERPRO_AUTH_URL', default='https://autenticacao.sapi.serpro.gov.br/authenticate')
SERPRO_GATEWAY_URL = config('SERPRO_GATEWAY_URL', default='https://gateway.apiserpro.serpro.gov.br/integra-contador/v1')
SERPRO_TOKEN_URL = config('SERPRO_TOKEN_URL', default='https://gateway.apiserpro.serpro.gov.br/integra-contador/v1/token')
SERPRO_API_URL = config('SERPRO_API_URL', default='https://gateway.apiserpro.serpro.gov.br/integra-contador-trial/v1/Consultar')
SERPRO_CERT_PUBLIC_PATH = config('SERPRO_CERT_PUBLIC_PATH', default='')
SERPRO_CERT_PRIVATE_KEY_PATH = config('SERPRO_CERT_PRIVATE_KEY_PATH', default='')
MEU_ESCRITORIO_CNPJ = config('MEU_ESCRITORIO_CNPJ', default='')

WHATSAPP_ACCESS_TOKEN = config('WHATSAPP_ACCESS_TOKEN', default='')
WHATSAPP_PHONE_NUMBER_ID = config('WHATSAPP_PHONE_NUMBER_ID', default='')
WHATSAPP_API_VERSION = config('WHATSAPP_API_VERSION', default='v20.0')
WHATSAPP_TEMPLATE_NAME_DOCS = config('WHATSAPP_TEMPLATE_NAME_DOCS', default='envio_documento_com_contato')

BB_API_BASE_URL = config('BB_API_BASE_URL', default='https://api.bb.com.br/cobrancas/v2')
BB_OAUTH_URL = config('BB_OAUTH_URL', default='https://oauth.bb.com.br/oauth/token')
BB_CLIENT_ID = config('BB_CLIENT_ID', default='')
BB_CLIENT_SECRET = config('BB_CLIENT_SECRET', default='')
BB_DEVELOPER_APPLICATION_KEY = config('BB_DEVELOPER_APPLICATION_KEY', default='')
BB_SCOPE = config('BB_SCOPE', default='')
BB_BANK_CODE_WITH_DV = config('BB_BANK_CODE_WITH_DV', default='001-9')
BB_WEBHOOK_TOKEN = config('BB_WEBHOOK_TOKEN', default='')

WKHTMLTOPDF_PATH = config('WKHTMLTOPDF_PATH', default='/usr/bin/wkhtmltopdf')
