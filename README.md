# Colonias

Sistema para la administración de una colonia residencial: pagos de residentes (comprobante + validación manual), gastos administrativos, nómina de seguridad y control de acceso vehicular/visitas.

## Stack

- **Frontend:** React Admin, desplegado en Azure Static Web Apps (plan gratuito, URL por defecto).
- **API:** Azure Functions (Node/TypeScript). Todas las operaciones pasan por aquí — nada habla directo con la base o con el storage.
- **Base de datos:** Azure SQL Database (free offer).
- **Archivos:** Azure Blob Storage (comprobantes, fotos), vía SAS emitido por el API.
- **Autenticación:** Auth0 (SPA + API), con roles Administrador / Guardián / Residente.
- **Notificaciones:** Kapso (WhatsApp) y Brevo (correo transaccional).
- **Monitoreo:** Azure Application Insights.

No hay dominio propio ni pasarela de pagos — ver el documento de arquitectura para el detalle completo de cada decisión y sus alternativas evaluadas.

## Estructura del repositorio

```
api/     API de Azure Functions
web/     Frontend en React Admin
```

## Estado del proyecto

El proyecto está en la fase de andamiaje inicial. La arquitectura y el catálogo de requerimientos funcionales (por rol: Administrador, Guardián, Residente) ya están definidos; la implementación avanza en fases, empezando por el esquema de base de datos y el esqueleto del API.
