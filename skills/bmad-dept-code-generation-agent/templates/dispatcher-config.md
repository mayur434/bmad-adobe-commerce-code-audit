# Dispatcher Configuration Generation Template

## AEMaaCS Dispatcher SDK Structure

```
dispatcher/
├── src/
│   ├── conf.d/
│   │   ├── available_vhosts/
│   │   │   └── {{project}}.vhost
│   │   ├── enabled_vhosts/
│   │   │   └── {{project}}.vhost -> ../available_vhosts/{{project}}.vhost
│   │   ├── rewrites/
│   │   │   ├── rewrite.rules
│   │   │   └── {{project}}_rewrite.rules
│   │   └── variables/
│   │       └── custom.vars
│   └── conf.dispatcher.d/
│       ├── available_farms/
│       │   └── {{project}}.farm
│       ├── enabled_farms/
│       │   └── {{project}}.farm -> ../available_farms/{{project}}.farm
│       ├── cache/
│       │   └── {{project}}_cache.any
│       ├── clientheaders/
│       │   └── {{project}}_clientheaders.any
│       └── filters/
│           └── {{project}}_filters.any
```

## Virtual Host

**File:** `conf.d/available_vhosts/{{project}}.vhost`

```apache
<VirtualHost *:80>
    ServerName "publish"
    ServerAlias "*"

    DocumentRoot ${DOCROOT}

    <Directory "${DOCROOT}">
        AllowOverride None
        Require all granted
    </Directory>

    <IfModule disp_apache2.c>
        ModMimeUsePathInfo On
        SetHandler dispatcher-handler
    </IfModule>

    # Custom rewrites
    Include conf.d/rewrites/{{project}}_rewrite.rules
</VirtualHost>
```

## Rewrite Rules

**File:** `conf.d/rewrites/{{project}}_rewrite.rules`

```apache
RewriteEngine On

# Enforce HTTPS (handled by CDN on AEMaaCS, but good practice)
# RewriteCond %{HTTP:X-Forwarded-Proto} !https
# RewriteRule ^(.*)$ https://%{HTTP_HOST}$1 [R=301,L]

# Remove trailing slash (except root)
RewriteCond %{REQUEST_URI} !^/$
RewriteRule ^(.+)/$ $1 [R=301,L]

# Vanity URLs (example)
# RewriteRule ^/about$ /content/{{project}}/us/en/about.html [PT,L]

# Sitemap
RewriteRule ^/sitemap\.xml$ /content/{{project}}/us/en.sitemap.xml [PT,L]
```

## Farm Configuration

**File:** `conf.dispatcher.d/available_farms/{{project}}.farm`

```
/publishfarm {
    /clientheaders {
        $include "../clientheaders/{{project}}_clientheaders.any"
    }

    /virtualhosts {
        "*"
    }

    /renders {
        /rend01 {
            /hostname "localhost"
            /port "4503"
        }
    }

    /filter {
        $include "../filters/{{project}}_filters.any"
    }

    /cache {
        $include "../cache/{{project}}_cache.any"
    }
}
```

## Filter Rules

**File:** `conf.dispatcher.d/filters/{{project}}_filters.any`

```
# Deny everything first
/0001 { /type "deny"  /url "*" }

# Allow content
/0010 { /type "allow" /method "GET" /url "/content/{{project}}/*" }
/0011 { /type "allow" /method "GET" /url "/content/experience-fragments/{{project}}/*" }
/0012 { /type "allow" /method "GET" /url "/content/dam/{{project}}/*" }

# Allow Core Component clientlibs
/0020 { /type "allow" /method "GET" /url "/etc.clientlibs/*" }

# Allow static resources
/0030 { /type "allow" /method "GET" /url "/libs/granite/csrf/token.json" /extension "json" }

# GraphQL endpoint
/0040 { /type "allow" /method '(GET|POST)' /url "/content/cq:graphql/{{project}}/*" }
/0041 { /type "allow" /method "GET" /url "/graphql/execute.json/*" }

# Deny WCM authoring selectors on publish
/0050 { /type "deny" /url "/content/{{project}}/*" /selectors '(edit|design|editcomponent|childrenlist|permissions|translate)' }

# Deny query debugging
/0060 { /type "deny" /url "/bin/*" }
/0061 { /type "deny" /url "/crx/*" }
/0062 { /type "deny" /url "/system/*" }
```

## Cache Rules

**File:** `conf.dispatcher.d/cache/{{project}}_cache.any`

```
/docroot "${DOCROOT}"
/statfileslevel "2"

/rules {
    /0000 { /glob "*" /type "deny" }
    /0001 { /glob "*.html" /type "allow" }
    /0002 { /glob "*.css" /type "allow" }
    /0003 { /glob "*.js" /type "allow" }
    /0004 { /glob "*.json" /type "allow" }
    /0005 { /glob "*.svg" /type "allow" }
    /0006 { /glob "*.png" /type "allow" }
    /0007 { /glob "*.jpg" /type "allow" }
    /0008 { /glob "*.jpeg" /type "allow" }
    /0009 { /glob "*.gif" /type "allow" }
    /0010 { /glob "*.webp" /type "allow" }
    /0011 { /glob "*.woff2" /type "allow" }
    /0012 { /glob "*.ico" /type "allow" }
}

/invalidate {
    /0000 { /glob "*" /type "deny" }
    /0001 { /glob "*.html" /type "allow" }
    /0002 { /glob "*.json" /type "allow" }
}

/allowAuthorized "0"

# Grace period for stale content
/gracePeriod "2"

# Enable TTL-based caching
/enableTTL "1"
```

## Custom Variables

**File:** `conf.d/variables/custom.vars`

```apache
# Project-specific variables
Define PROJECT_NAME {{project}}
Define PROJECT_DOMAIN {{domain}}

# Cache TTLs
Define CACHE_HTML_TTL 300
Define CACHE_STATIC_TTL 86400
```

## Client Headers

**File:** `conf.dispatcher.d/clientheaders/{{project}}_clientheaders.any`

```
"CSRF-Token"
"X-Forwarded-Proto"
"X-Forwarded-Host"
"Host"
"X-Content-Type-Options"
"X-Frame-Options"
"Authorization"
```
