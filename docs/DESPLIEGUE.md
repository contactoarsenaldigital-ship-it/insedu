# Despliegue de la demostración (Etapa 1)

Resultado: una dirección pública con HTTPS (por ejemplo `https://insedu-demo.vercel.app`) con el colegio
ficticio, que funciona en computadores y teléfonos, incluido el escáner de credenciales con cámara.
Tiempo estimado: 45 minutos. Todo se puede hacer en planes gratuitos.

> La Etapa 1 usa **solo datos ficticios**. No cargue datos reales de estudiantes en esta instalación.

## 1. Repositorio en GitHub

1. En GitHub, cree un repositorio **privado** vacío, por ejemplo `insedu`.
2. En una terminal, dentro de `C:\Proyectos-Desarrollo-Software\INSEDU`:

   ```bash
   git init
   git add .
   git commit -m "INSEDU MVP Etapa 1"
   git branch -M main
   git remote add origin https://github.com/<su-usuario>/insedu.git
   git push -u origin main
   ```

   El archivo `.gitignore` ya excluye `node_modules`, `.next`, `.env` y las capturas de pruebas.

## 2. Dos proyectos en Supabase (región São Paulo)

Cree **dos** proyectos separados en [supabase.com](https://supabase.com), ambos en la región
**South America (São Paulo)**:

| Proyecto | Uso |
| --- | --- |
| `insedu-main` | Datos del colegio ficticio |
| `insedu-vault` | Bóveda de Salvaguarda (solo contenido cifrado) |

Guarde la contraseña de base de datos de cada uno.

### Migraciones

En cada proyecto, abra **SQL Editor**, pegue y ejecute los archivos en este orden:

| Proyecto | Archivos |
| --- | --- |
| `insedu-main` | `supabase/main/migrations/20261015000100_core.sql`, luego `supabase/main/migrations/20261016000100_demo_state.sql` |
| `insedu-vault` | `supabase/vault/migrations/20261015000100_vault.sql`, luego `supabase/vault/migrations/20261016000100_demo_state.sql` |

### Cadenas de conexión

En cada proyecto: **Connect → Connection string → Transaction pooler** (puerto **6543**). Copie la
URI y reemplace `[YOUR-PASSWORD]` por la contraseña del proyecto. Ejemplo:

```
postgresql://postgres.abcdefghijk:SU_CLAVE@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
```

## 3. Proyecto en Vercel

1. En [vercel.com](https://vercel.com): **Add New → Project → Import** el repositorio `insedu`.
2. **Root Directory:** `apps/web`. Vercel detecta Next.js y pnpm.
3. **Environment Variables** (Production y Preview):

| Variable | Valor |
| --- | --- |
| `INSEDU_DATA_MODE` | `synthetic` |
| `DATABASE_URL` | Cadena del pooler de `insedu-main` |
| `VAULT_DATABASE_URL` | Cadena del pooler de `insedu-vault` |
| `VAULT_MASTER_KEY` | Resultado de `openssl rand -base64 32` (guárdelo en un lugar seguro) |
| `INSEDU_SESSION_SECRET` | Resultado de `openssl rand -hex 32` |
| `AI_TIER` | `free` |
| `GEMINI_API_KEY` | Su API key de Google AI Studio (opcional: sin ella el Copiloto funciona en modo demostración) |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` (o `gemini-3.8-flash`, más capaz; Google limita los modelos 2.5 a cuentas que ya los usaban) |
| `AI_DAILY_LIMIT` | `100` (opcional: tope diario de solicitudes al Copiloto, sumando todos los usuarios) |

   Si no tiene `openssl`, en PowerShell puede generar cada llave (sirve para `VAULT_MASTER_KEY` y para
   `INSEDU_SESSION_SECRET`) con un generador criptográfico:
   `$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)`

   No use `Get-Random`: no es un generador seguro para llaves.

4. **Deploy.** La región de las funciones queda en São Paulo (`apps/web/vercel.json`), junto a Supabase.

## 4. Verificación

1. Abra la dirección pública. La primera visita genera el colegio ficticio en la base (unos segundos).
2. Ingrese como **Daniela Castro** y abra **Demo**: debe decir *Almacenamiento: base de datos*.
3. Abra `/escanear` desde un teléfono: la cámara debe activarse (requiere HTTPS, que Vercel provee).
4. Antes de cada presentación, use **Demo → Reiniciar** para volver al estado inicial.

## Seguridad de esta instalación

- Las tablas `demo` no son accesibles con las claves públicas de Supabase; solo el servidor escribe.
- La bóveda está en otro proyecto y su contenido va cifrado con `VAULT_MASTER_KEY`. Si cambia esa
  llave, los casos existentes no podrán abrirse: reinicie la demostración.
- `GEMINI_API_KEY`, las cadenas de conexión y las llaves nunca llevan prefijo `NEXT_PUBLIC_`.
- El nivel gratuito de Gemini se usa solo con datos ficticios; con `INSEDU_DATA_MODE=real` el sistema
  lo bloquea (ADR 0003).
