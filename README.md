# Proyecto Grupo 2 - ilo & oli

Plataforma de adopción de mascotas, tienda y veterinarias.
Frontend en HTML, CSS y JavaScript. Backend en Python (Flask) con base de datos SQLite.

## Cómo ejecutarlo

Descargar el zip, extraerlo, abrir el cmd desde la carpeta, copiar pegar y enter de los comandos

```
cd backend
pip install -r requirements.txt
python app.py
```

## Abrir en el navegador

- Escritorio: http://127.0.0.1:5000
- Móvil: http://127.0.0.1:5000/movil.html

## Credenciales de prueba

| Rol | Correo | Clave |
|---|---|---|
| Administrador | admin@iloyoli.co | Admin123! |
| Usuario | usuario@iloyoli.co | Usuario123! |

También se puede crear un usuario nuevo desde "Registrarse".

## Estructura

- backend/: API REST, sesiones y base de datos
- frontend/: versión de escritorio (index.html) y móvil (movil.html)

## Ramas

- main: La versión final y probada, la que se entrega. Aquí solo llegan cambios ya aprobados.
- develop: El trabajo del frontend y la zona de pruebas, ajustes de diseño y textos. También es donde se junta todo para probar el proyecto completo antes de pasarlo a main.
- backend: El trabajo del servidor: lo que esté en la carpeta backend, es decir, la API, el CRUD, las sesiones y la base de datos.
