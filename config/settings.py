import os
from pathlib import Path
import environ

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Initialize environ
env = environ.Env(
    # set casting, default value
    DEBUG=(bool, False),
    CELERY_TASK_ALWAYS_EAGER=(bool, False),
)
# reading .env file
environ.Env.read_env(os.path.join(BASE_DIR, '.env'))

# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/4.2/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = env('SECRET_KEY', default='django-insecure-fallback-key')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = env('DEBUG')

ALLOWED_HOSTS = env.list('ALLOWED_HOSTS', default=['*'])


# Application definition

INSTALLED_APPS = [
    'daphne',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'channels',
    # GIS and Rest framework
    'django.contrib.gis',
    'rest_framework',
    'rest_framework_gis',
    'corsheaders', # 新增 CORS
    'rest_framework_simplejwt',
    # Local apps
    'core',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware', # 新增 CORS，必须放在 common 前面
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# Local demos stay frictionless. Production deployments must list their frontend
# origins explicitly so a public API is not accidentally open to every website.
CORS_ALLOW_ALL_ORIGINS = DEBUG
CORS_ALLOWED_ORIGINS = env.list(
    'CORS_ALLOWED_ORIGINS',
    default=[
        'http://localhost:5173',
        'http://127.0.0.1:5173',
    ],
)
CORS_ALLOWED_ORIGIN_REGEXES = env.list(
    'CORS_ALLOWED_ORIGIN_REGEXES',
    default=[
        r'^https://.*\.vercel\.app$',
        r'^https://.*\.onrender\.com$',
    ],
)

ROOT_URLCONF = 'config.urls'

ASGI_APPLICATION = 'config.asgi.application'

CHANNEL_LAYER_BACKEND = env('CHANNEL_LAYER_BACKEND', default='')
REDIS_URL = env('CELERY_BROKER_URL', default='')
USING_IN_MEMORY_CHANNEL_LAYER = (
    CHANNEL_LAYER_BACKEND == 'memory'
    or (not CHANNEL_LAYER_BACKEND and not REDIS_URL)
)

if USING_IN_MEMORY_CHANNEL_LAYER:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels.layers.InMemoryChannelLayer',
        },
    }
else:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels_redis.core.RedisChannelLayer',
            'CONFIG': {
                "hosts": [REDIS_URL or 'redis://redis:6379/0'],
            },
        },
    }

# A database poll keeps WebSocket clients current when multiple server instances
# each have their own in-memory channel layer.
ALERT_DB_POLL_INTERVAL = env.float(
    'ALERT_DB_POLL_INTERVAL',
    default=3.0 if USING_IN_MEMORY_CHANNEL_LAYER else 0.0,
)

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


# Database
# https://docs.djangoproject.com/en/4.2/ref/settings/#databases

DATABASES = {
    'default': env.db(
        'DATABASE_URL',
        default='postgis://postgres:postgres@db:5432/agri_guard_db',
    )
}

# Local Windows development may need explicit GDAL/GEOS DLL paths.
# Docker's PostGIS image provides these libraries on the system path.
GDAL_LIBRARY_PATH = env('GDAL_LIBRARY_PATH', default=None)
GEOS_LIBRARY_PATH = env('GEOS_LIBRARY_PATH', default=None)

# The Windows wheel ships its own PROJ/GDAL data. Export those paths before the
# first geometry transform so management commands and tests do not diverge.
try:
    import osgeo

    osgeo_dir = Path(osgeo.__file__).resolve().parent
    os.environ.setdefault('PROJ_LIB', str(osgeo_dir / 'data' / 'proj'))
    os.environ.setdefault('GDAL_DATA', str(osgeo_dir / 'data' / 'gdal'))
except ImportError:
    pass


# Password validation
# https://docs.djangoproject.com/en/4.2/ref/settings/#auth-password-validators

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


# Internationalization
# https://docs.djangoproject.com/en/4.2/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/4.2/howto/static-files/

STATIC_URL = 'static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'static')

# Default primary key field type
# https://docs.djangoproject.com/en/4.2/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Celery Configuration Options
CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = env('CELERY_RESULT_BACKEND', default='')
CELERY_TASK_ALWAYS_EAGER = env.bool('CELERY_TASK_ALWAYS_EAGER', default=not CELERY_BROKER_URL)
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE

# Twilio Configuration
TWILIO_ACCOUNT_SID = env('TWILIO_ACCOUNT_SID', default='')
TWILIO_AUTH_TOKEN = env('TWILIO_AUTH_TOKEN', default='')
TWILIO_PHONE_NUMBER = env('TWILIO_PHONE_NUMBER', default='')
LIVE_SMS_ENABLED = env.bool('LIVE_SMS_ENABLED', default=False)

# OpenAI / AI Configuration for Damage Estimation
OPENAI_API_KEY = env('OPENAI_API_KEY', default='')
OPENAI_MODEL = env('OPENAI_MODEL', default='gpt-4o-mini')
LIVE_AI_ENABLED = env.bool('LIVE_AI_ENABLED', default=False)
LIVE_SETTLEMENT_ENABLED = env.bool('LIVE_SETTLEMENT_ENABLED', default=False)

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticatedOrReadOnly',
    )
}

from datetime import timedelta
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(days=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
}


# Cross-Origin & Security Headers for Cloud Deployments (Vercel & Render)
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = [
    'https://*.vercel.app',
    'https://*.onrender.com',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
]
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# Production defaults are secure-by-default behind Vercel/Render's HTTPS proxy.
# Local DEBUG runs keep redirects, secure cookies, and HSTS disabled.
SECURE_SSL_REDIRECT = env.bool('SECURE_SSL_REDIRECT', default=not DEBUG)
SESSION_COOKIE_SECURE = env.bool('SESSION_COOKIE_SECURE', default=not DEBUG)
CSRF_COOKIE_SECURE = env.bool('CSRF_COOKIE_SECURE', default=not DEBUG)
SECURE_HSTS_SECONDS = env.int(
    'SECURE_HSTS_SECONDS',
    default=31536000 if not DEBUG else 0,
)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env.bool(
    'SECURE_HSTS_INCLUDE_SUBDOMAINS',
    default=False,
)
SECURE_HSTS_PRELOAD = env.bool('SECURE_HSTS_PRELOAD', default=False)
