# Bruma Labs Innovation Hub (`bruma-innovation-hub`)

> **Notion-as-code**: especificación declarativa, generador y suite de verificación automatizada para el Innovation Hub de Bruma Labs.

---

## 🏛️ Contexto y Referencias Vivas

- **Página Padre (Bruma Labs)**:
  - ID: `41e66eb2-5f63-817b-be79-c2eb3fb1c03b` (`41e66eb25f63817bbe79c2eb3fb1c03b`)
  - URL: [Bruma Labs en Notion](https://app.notion.com/p/Bruma-Labs-41e66eb25f63817bbe79c2eb3fb1c03b)
- **Hub Actual Vivo (Referencia)**:
  - ID: `42366eb2-5f63-8137-af00-cbb525826085` (`42366eb25f638137af00cbb525826085`)
  - Databases vivas extraídas:
    - `Ideas pipeline`: `42366eb2-5f63-818a-b59d-d5024d132f73` (Data Source: `42366eb2-5f63-8135-ba41-000ba12bf7c8`)
    - `Experiments`: `42366eb2-5f63-813b-ac88-e6ccb2f44bf0` (Data Source: `42366eb2-5f63-816d-ba65-000bfb5ec1bd`)
    - `Research library`: `42366eb2-5f63-818a-8228-ff25d2652e3e` (Data Source: `42366eb2-5f63-8135-bd49-000bd803fc0e`)

---

## 📁 Estructura del Repositorio

```text
bruma-innovation-hub/
├── .github/
│   └── workflows/
│       ├── build.yml         # workflow_dispatch manual con confirm: yes
│       └── verify.yml        # push a main y workflow_dispatch
├── spec/
│   ├── databases.json        # Schemas de Ideas, Experiments y Research
│   ├── hub.json              # Bloques de contenido, columnas 4x25, callouts y toggles
│   └── seed.json             # Filas de ejemplo genéricas extraídas de la página viva
├── scripts/
│   ├── build.ts              # Orquestador de creación en Notion (orden estricto)
│   └── verify.ts             # Validador recursivo (toggles, columnas, TODO/lorem, relaciones)
├── out/
│   └── ids.json              # IDs generados tras el build (consumido por verify)
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🔑 Configuración de Secretos en GitHub

En el repositorio `FriskyDevelopments/bruma-innovation-hub`:
**Settings → Secrets and variables → Actions → New repository secret**

1. `NOTION_TOKEN`: Token secreto de la integración interna de Notion con permisos de lectura, inserción y actualización.
2. `NOTION_PARENT_ID`: `41e66eb2-5f63-817b-be79-c2eb3fb1c03b` (ID de la página padre *Bruma Labs*).

---

## 🚀 Uso Local

```bash
# Instalar dependencias
npm install

# Construir el Hub en Notion
export NOTION_TOKEN="secret_..."
export NOTION_PARENT_ID="41e66eb25f63817bbe79c2eb3fb1c03b"
npm run build:hub

# Verificar integridad del Hub
npm run verify
```
