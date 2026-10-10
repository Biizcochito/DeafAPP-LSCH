# Cómo trabajamos en DeafApp

## Estructura de ramas

### 1. `master` (Producción)

- **Nunca** se programa ni se hace commit directamente en esta rama.
- Contiene el código estable y finalizado.
- Solo se actualiza mediante Pull Requests aprobados desde `dev`.
- Cada cambio que entra a `master` se publica automáticamente en https://deafapps.com (workflow `Deploy a HostGator`).

### 2. `dev` (Desarrollo)

- Es el borrador oficial de la aplicación. Aquí se junta el trabajo de todo el equipo.
- Haz `git pull origin dev` al inicio de tu jornada para tener el código más reciente de todos.
- Tampoco se programa directamente aquí: solo recibe Pull Requests desde ramas `feature/*` o `fix/*`.

### 3. `feature/*` y `fix/*` (Tu espacio de trabajo)

- Cuando tomes un ticket en Jira, crea una rama nueva partiendo de `dev`.
- El nombre indica lo que harás: `feature/login`, `feature/carrito`, `fix/boton-roto`.
- Al terminar, abre un Pull Request hacia `dev`.

### Otras ramas

- `cloudflare/workers-autoconfig`: rama de la configuración de Cloudflare. Se conserva aparte; no se usa para desarrollo diario.

## Flujo de trabajo

```bash
# 1. Al empezar el día
git checkout dev
git pull origin dev

# 2. Al tomar un ticket de Jira
git checkout -b feature/nombre-del-ticket

# 3. Mientras trabajas
git add .
git commit -m "Describe el cambio"
git push -u origin feature/nombre-del-ticket

# 4. Al terminar: abre un Pull Request de tu rama hacia dev en GitHub
```

Para pasar a producción, se abre un Pull Request de `dev` hacia `master` y se aprueba antes de hacer merge.

## Despliegue

- `.github/workflows/deploy-hostgator.yml` compila la versión web y la sube por FTPS a HostGator en cada cambio de `master`.
- `deploy/.htaccess` se copia a la web publicada. Debe quedarse versionado en el repo: no lo agregues al `.gitignore`.
