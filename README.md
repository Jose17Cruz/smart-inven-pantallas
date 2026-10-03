# Smart Inven — inventario de pantallas

Aplicación web adaptable para registrar modelos de pantallas, actualizar existencias, recibir avisos al llegar a 1 o 0 unidades y descargar una lista Excel de surtido.

## Funciones

- Crear, editar y eliminar modelos y actualizar stock.
- Importar Excel (`.xlsx`); detecta encabezados como Modelo, Producto, SKU, Código, Stock, Existencia y Cantidad. Busca encabezados en las primeras 10 filas.
- Buscar y filtrar artículos disponibles, con poco stock o agotados.
- Alertas visibles en el panel cuando una pantalla tiene 1 unidad o está agotada.
- Descargar el surtido pendiente como Excel.
- Sin Supabase, guarda información solo en el almacenamiento local de este navegador.
- Con Supabase, iniciar sesión con correo para sincronizar el mismo inventario entre varios dispositivos.

## Ejecutar localmente

Requiere Node.js 20 o posterior. Instala las dependencias con `npm install` y ejecuta `npm run dev`; Vite mostrará la dirección local. Para comprobar la compilación, usa `npm run build`.

## Habilitar sincronización entre dispositivos

GitHub Pages solo publica archivos estáticos; no comparte datos por sí solo. La sincronización de este proyecto utiliza Supabase como base de datos en la nube:

1. Crea un proyecto en Supabase y abre **SQL Editor**.
2. Ejecuta el contenido de `supabase/schema.sql`. La tabla utiliza Row Level Security para que cada correo solo pueda consultar y cambiar sus propios datos.
3. En Supabase, habilita el proveedor de acceso por correo (Email OTP/Magic Link). Añade la dirección de tu sitio GitHub Pages a **Authentication → URL Configuration → Redirect URLs**.
4. Copia la URL del proyecto y la clave pública `anon` (no la `service_role`). Crea `.env.local` basándote en `.env.example` para ejecutar localmente.
5. En GitHub, abre **Settings → Secrets and variables → Actions → Variables** y crea `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con esos valores. La clave `anon` es pública por diseño; RLS protege los datos. Nunca publiques `service_role`.
6. Sube el proyecto a un repositorio GitHub con rama `main`; en **Settings → Pages**, selecciona **GitHub Actions**. El workflow de este repositorio compila y publica cada actualización a `main`.
7. Accede desde cada dispositivo con el mismo correo. Supabase enviará un enlace de un solo uso.

Si todavía no están configuradas las variables, la app funciona localmente, pero los datos no se comparten entre navegadores/dispositivos.

## Importar el archivo de inventario

En la aplicación, selecciona **Importar Excel** y elige el archivo. La primera fila debe incluir encabezados reconocibles; por ejemplo, `Modelo` y `Stock`. El código, categoría y mínimo son opcionales. Después de importar, revisa la lista y ajusta los datos que no se hayan reconocido correctamente.
