# Language Detection Map

Used by the Tier 1 engine (`scripts/engines/git/audit.ts`) to resolve a file path to a language name.
The language name must match a section heading in `resources/security-rules.md`.

Filename matches are checked first, then extension matches.

---

## Filename Matches (exact basename)

| Filename | Language |
|----------|----------|
| `Dockerfile` | Dockerfile |
| `Makefile` | Makefile |
| `.env` | Environment Config |
| `.htaccess` | Apache Config |
| `nginx.conf` | Nginx Config |
| `docker-compose.yml` | Docker Compose |
| `docker-compose.yaml` | Docker Compose |
| `package.json` | Node.js Package Config |

---

## Extension Matches

### Web — Frontend

| Extension | Language |
|-----------|----------|
| `.html` `.htm` | HTML |
| `.css` | CSS |
| `.scss` | SCSS |
| `.sass` | SASS |
| `.less` | LESS |
| `.js` `.mjs` `.cjs` | JavaScript |
| `.jsx` | JavaScript (React) |
| `.ts` | TypeScript |
| `.tsx` | TypeScript (React) |
| `.vue` | Vue |
| `.svelte` | Svelte |

### Backend

| Extension | Language |
|-----------|----------|
| `.java` | Java |
| `.kt` | Kotlin |
| `.py` | Python |
| `.rb` | Ruby |
| `.php` | PHP |
| `.go` | Go |
| `.rs` | Rust |
| `.cs` | C# |
| `.cpp` | C++ |
| `.c` | C |
| `.h` | C/C++ Header |
| `.swift` | Swift |
| `.scala` | Scala |
| `.groovy` | Groovy |

### Data / Config

| Extension | Language |
|-----------|----------|
| `.xml` | XML |
| `.json` | JSON |
| `.yaml` `.yml` | YAML |
| `.toml` | TOML |
| `.env` | Environment Config |
| `.properties` | Java Properties |

### Query

| Extension | Language |
|-----------|----------|
| `.sql` | SQL |
| `.graphql` `.gql` | GraphQL |

### Shell

| Extension | Language |
|-----------|----------|
| `.sh` | Shell Script |
| `.bash` | Bash |
| `.zsh` | Zsh |
| `.fish` | Fish Shell |
| `.ps1` | PowerShell |

### Templates

| Extension | Language |
|-----------|----------|
| `.ejs` | EJS Template |
| `.hbs` | Handlebars |
| `.pug` | Pug |
| `.jinja` `.j2` | Jinja2 |

### Infrastructure

| Extension | Language |
|-----------|----------|
| `.tf` | Terraform (HCL) |
| `.proto` | Protocol Buffers |

---

## Fallback

Any extension not listed above → language: `Unknown` → use **Default** rules from `resources/security-rules.md`.
