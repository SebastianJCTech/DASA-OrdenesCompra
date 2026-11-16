# Puesta en marcha

## Estado real

Código inicial implementado. Falta ejecutar database.sql en Supabase, crear las seis cuentas, conectar config.js y comprobar los escenarios contra la base real. No se ha publicado ni conectado un repositorio remoto. No entregar como terminado antes de completar PRUEBAS.md.

## 1. Base de datos sin instalaciones

1. En https://supabase.com/dashboard crea una cuenta y un proyecto en el plan Free. Guarda la contraseña de base de datos en privado; no se coloca en el código.
2. Espera que el proyecto esté listo. En SQL Editor crea una consulta, pega database.sql completo y ejecútalo una sola vez en la base nueva.
3. En Authentication → Users crea cuatro usuarios internos y dos externos con correos de prueba que controles y contraseñas diferentes. No publiques sus contraseñas en GitHub. Para pruebas puedes usar la opción de confirmar el correo desde el panel.
4. Copia el UUID de cada usuario y ejecuta una consulta como esta, sustituyendo los seis UUID por los reales:

```sql
insert into public.profiles(id,name,role,approval_limit) values
('UUID_INTERNO_1','Administrador','interno',5000),
('UUID_INTERNO_2','Compras','interno',10000),
('UUID_INTERNO_3','Gerencia','interno',50000),
('UUID_INTERNO_4','Finanzas','interno',100000),
('UUID_EXTERNO_1','Proveedor A','externo',0),
('UUID_EXTERNO_2','Proveedor B','externo',0);
```

5. En Project Settings → API copia Project URL y la clave **publishable** (o anon heredada). Escríbelas en config.js. Esa clave pública está protegida por los permisos de PostgreSQL. Nunca uses secret ni service_role en archivos públicos.
6. Para abrirlo localmente usa la terminal de VS Code y ejecuta `node serve.mjs`. Abre http://localhost:4173. Si Node no está en la terminal del usuario, usa la ruta del ejecutable que ya incluye Codex, sin instalarlo: `& 'C:\Users\rivasl\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' serve.mjs`.

## 2. Credenciales corporativas

El botón Microsoft usa Supabase Auth con Azure. Hace falta registrar una aplicación en Microsoft Entra y configurar Azure en Authentication → Sign In / Providers. Usa el tenant corporativo permitido y la URL de callback que muestra Supabase. Agrega la URL local y la publicada a las Redirect URLs. El usuario debe tener su fila en profiles con rol interno: conocer un correo corporativo no concede permisos.

Si no tienes acceso al tenant de DASA, las cuatro cuentas de prueba permiten evaluar el flujo, pero **no sustituyen la integración corporativa**. Declara esa limitación al entregar. Microsoft es una elección de proveedor para este MVP, pendiente de confirmar con DASA.

Documentación: https://supabase.com/docs/guides/auth/social-sign-in/auth-azure

## 3. GitHub y enlace gratuito

1. Crea un repositorio público personal en GitHub, por ejemplo DASA-OrdenesCompra.
2. Desde Add file → Upload files, sube el contenido de esta carpeta a la raíz del repositorio. No subas contraseñas ni credenciales privadas.
3. En Settings → Pages elige Deploy from a branch, rama main y carpeta / (root). Guarda.
4. GitHub mostrará la URL asignada cuando termine de publicar; normalmente sigue el formato https://TU_USUARIO.github.io/DASA-OrdenesCompra/. No necesitas comprar dominio.
5. Agrega esa URL completa a Authentication → URL Configuration en Supabase (Site URL y Redirect URLs). Prueba sesión normal y Microsoft si está configurado.
6. Entrega la URL real del repositorio, la URL real del sitio, diagrama-er.md y las cuentas de evaluación por un canal privado.

GitHub Pages publica la interfaz; Supabase aloja autenticación, PostgreSQL y las operaciones del servidor. No hay un servidor Node que desplegar. serve.mjs solo es una comodidad para la vista local.

Guía oficial: https://docs.github.com/en/pages/quickstart
Plan Supabase: https://supabase.com/pricing

## Decisiones para explicar en entrevista

- Los permisos se aplican en RLS de PostgreSQL. Ocultar botones solo ayuda a la experiencia de uso.
- El navegador no puede escribir directamente las tablas: llama funciones SQL con permisos restringidos. El perfil y los límites solo se administran desde el panel de la base.
- Cada función valida los campos, la sesión, la propiedad y el estado actual; bloquear la fila con FOR UPDATE serializa dos decisiones simultáneas.
- El primer aprobador es el asignado. Si el monto supera su límite, queda pendiente hasta que apruebe otro interno con límite positivo. No se permite autoaprobación. Interpretación adoptada: el segundo aprobador no necesita cubrir por sí solo el importe; confirmar esa regla con DASA.
- No se edita después del envío. Un rechazo es final; se crea otra orden si hace falta corregir. Cancelar requiere motivo; solo un interno cierra órdenes aprobadas; solo se elimina un borrador. Son decisiones del MVP donde el PDF no detalla transiciones.
- Cada cambio de orden registra antes/después y actor en la misma transacción. Las decisiones individuales quedan en approvals con el límite vigente al decidir.
- Los siete reportes consultan la base nuevamente. Periodo por creación para estado/historial, por decisión para rechazos/tiempo/gasto aprobado, por cierre para gasto de proveedor. Fechas en Guatemala. Tiempo por aprobador = horas desde envío hasta su aprobación. Vencida = fecha límite anterior a hoy; antigüedad = días desde envío.
- Exportación PDF mediante impresión nativa: Exportar PDF abre una vista imprimible; pulsa Guardar como PDF y selecciona ese destino en el navegador. No hay descarga automática de PDF.
- Proveedor y departamento son texto en este MVP. Las órdenes tienen un importe total y moneda GTQ; el PDF no exige líneas ni múltiples monedas.
- Los reportes agregan en el navegador datos que el servidor ya autorizó. Esto simplifica la prueba; para mucho volumen conviene agregar/paginar en SQL. El listado actual usa el límite de respuesta de Supabase: no se ha validado con más de 1.000 órdenes.
- Se usa una librería Supabase desde un CDN y requiere internet. La aplicación no guarda órdenes en localStorage ni usa datos ficticios como base real.
