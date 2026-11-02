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
6. Las cuentas las crea solo el jefe, desde Supabase (la app no tiene registro):
   **Authentication > Users > Add user > Create new user**, con correo y clave, y marca **Auto Confirm User**.
   Crea primero tu cuenta: **la primera cuenta queda como jefe**. Las siguientes son empleados.
7. Después, en **Authentication > Sign In / Providers**, desactiva **Allow new users to sign up**.
   Las cuentas creadas desde el panel siguen funcionando.
8. Ingresa a la app con tu cuenta. En el menú de tu foto > Ajustes > Equipo escribe el nombre de cada
   empleado y fija su rol y porcentaje.

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
