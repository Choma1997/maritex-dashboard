# Maritex Dashboard (GitHub Pages)

Proyecto React + Vite para publicar dashboard en GitHub Pages.

## 1) Requisitos
- Node.js 18 o superior
- Git instalado

## 2) Instalar y probar local

```bash
npm install
npm run dev
```

## 3) Publicar en GitHub
1. Crear un repositorio nuevo en GitHub (sin README).
2. En esta carpeta ejecutar:

```bash
git init
git add .
git commit --trailer "Made-with: Cursor" -m "Initial dashboard"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

## 4) Activar GitHub Pages
- En GitHub: Settings -> Pages
- Build and deployment: "GitHub Actions"

## 5) Deploy automatico (Action)
Cada push a `main` genera sitio publicado.
URL final:
`https://TU_USUARIO.github.io/TU_REPO/`

## Nota de autenticacion Microsoft
En Azure App Registration, agrega como Redirect URI la URL de GitHub Pages.
