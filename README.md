# Master Wash - Motos lavadas

App en React (Vite) para llevar las motos lavadas por turno, con modelo, hora de entrada,
método de pago, extras, fotos y PDF (con o sin el porcentaje ya sacado).

## Correr en local
    npm install
    npm run dev

## Subir a Netlify
Build command: `npm run build`  -  Publish directory: `dist`
(ya viene configurado en `netlify.toml`).

## Archivos útiles
- `src/modelos.js`: lista de modelos de moto del desplegable.
- `src/logo.js`: logo embebido (se usa en la app y en el PDF).

## Base de datos opcional (usuarios, historial y fotos en la nube)

Sin configurar nada, la app funciona en modo local (todo se guarda en el celular).
Para activar usuarios, historial compartido y fotos en la nube usa Supabase (plan gratis):

1. Crea un proyecto en https://supabase.com
2. En **SQL Editor** pega y ejecuta el contenido de `supabase/schema.sql`
3. En **Authentication > Providers > Email** desactiva "Confirm email" (para que no pida confirmar el correo)
4. En **Project Settings > API** copia la URL y la clave `anon public`
5. En Netlify: **Site configuration > Environment variables** agrega
   `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, y vuelve a desplegar
6. Crea tu cuenta de jefe una sola vez: **Authentication > Users > Add user > Create new user**,
   con correo y clave, y marca **Auto Confirm User**. La primera cuenta queda como jefe.
7. En **Authentication > Sign In / Providers** desactiva **Allow new users to sign up**.
8. Despliega la función que crea las cuentas desde la app (ver "Gestión de cuentas desde la app").
   Desde ahí, el jefe crea y administra a los empleados en el menú de su foto > Equipo.

### Gestión de cuentas desde la app
La app trae un panel **Equipo** (solo jefe): crear empleados, cambiar nombre, rol y porcentaje,
cambiar claves y desactivar cuentas, sin entrar a Supabase. Para eso usa una función del lado del
servidor (la clave de servicio nunca llega al celular):
1. En el SQL Editor ejecuta el bloque final de `supabase/schema.sql` ("Gestion de cuentas desde la app").
2. En Supabase: **Edge Functions > Deploy a new function > Via Editor**, nombre `admin-usuarios`,
   pega el contenido de `supabase/functions/admin-usuarios/index.ts` y despliega.
   (Con la CLI: `supabase functions deploy admin-usuarios`.)
Las claves necesarias las provee Supabase automáticamente a la función.

### Bolsa de propinas
Cada moto puede tener una propina (se anota tocando la moto). La propina no entra en el porcentaje:
va a una bolsa por turno que se reparte proporcional a las motos que lavó cada empleado.
Si ya tenías la base creada, ejecuta en el SQL Editor solo el bloque final de `supabase/schema.sql`
("Bolsa de propinas"), de lo contrario la app no podrá guardar motos nuevas.

### Cierre de turnos
Al terminar, el empleado toca su foto > Cerrar turno (o el resumen del turno). El turno queda bloqueado
y el historial muestra un solo registro por turno, con su resumen y PDF. El jefe puede reabrirlo.
Si ya tenías la base creada, ejecuta en el SQL Editor el bloque final de `supabase/schema.sql`
("Cierre de turnos").
Los turnos van de 7 a. m. a 7 p. m. y de 7 p. m. a 7 a. m.; la madrugada cuenta como parte del turno de la noche anterior.

Cuando todos los empleados ya tengan cuenta, en Supabase (Authentication > Sign In / Providers)
puedes desactivar "Allow new users to sign up" para que nadie más se registre.

## Uso en celulares
- Es una app instalable (PWA): en Android, menu del navegador > Instalar app; en iPhone, Safari > Compartir > Agregar a pantalla de inicio. Tambien hay una indicacion en Ajustes.
- Abre sin conexion (la pantalla); para registrar y consultar datos se necesita internet. Sin conexion aparece un aviso.
- El boton "atras" del celular cierra menus y hojas en vez de salir de la app.
- Las fotos se pueden tomar con la camara o elegir de la galeria.
- Se adapta a pantallas desde 360 px, al teclado abierto y a la orientacion horizontal.
- Si cambias la app, vuelve a desplegar: el service worker (`public/sw.js`) toma la version nueva al abrir.
