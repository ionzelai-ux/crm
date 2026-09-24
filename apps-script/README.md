# Backend del CRM (Google Apps Script)

`Code.gs` es la copia versionada del Apps Script que vive en el Google Sheet del CRM
(Extensiones → Apps Script). Lo usan las tres apps: el CRM, la app de Equipo
(team.codektraining.es) y la web (codektraining.es). Make.com también le envía los
leads de Meta con `action: 'add'`.

## Cómo publicar un cambio sin romper nada

1. Copia el contenido de `Code.gs` y pégalo en el editor de Apps Script (sustituye todo).
2. Guarda.
3. **Implementar → Gestionar implementaciones → ✏️ (editar) → Versión: "Nueva versión" → Implementar.**

No uses "Nueva implementación": crea una URL `/exec` distinta y el CRM, la app de
Equipo, la web y Make seguirían apuntando a la antigua.
