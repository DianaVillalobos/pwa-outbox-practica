// Registro del Service Worker (ruta relativa para GitHub Pages)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then((reg) => console.log('[SW] Registrado, scope:', reg.scope))
        .catch((err) => console.error('[SW] Error al registrar:', err));

    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.tipo === 'OUTBOX_SINCRONIZADO') {
            console.log('[UI] Confirmación recibida del Service Worker. Actualizando bandeja...');
            renderizarColaOutbox();
        }
    });
}

//Indicador de red 
function actualizarIndicadorRed() {
    const badge = document.getElementById('badge-red');

    if (navigator.onLine) {
        badge.textContent = 'En Línea';
        badge.className = 'badge online';
    } else {
        badge.textContent = 'Sin Conexión';
        badge.className = 'badge offline';
    }
}

// Create
function procesarEnvioReporte(datosFormulario) {
    const endpoint = 'https://jsonplaceholder.typicode.com/posts';

    return fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datosFormulario)
    })
        .then((respuesta) => {
            if (!respuesta.ok) throw new Error('Error HTTP del servidor');
            return respuesta.json();
        })
        .then(() => {
            // Envío exitoso en vivo: registrar en bitácora local como sincronizado
            return guardarRegistro({
                ...datosFormulario,
                estado: 'sincronizado',
                fechaCreacion: Date.now()
            });
        })
        .catch(() => {
            console.warn('[Outbox] Sin conexión. Encolando en IndexedDB...');

            return guardarRegistro({
                ...datosFormulario,
                estado: 'pendiente',
                fechaCreacion: Date.now()
            })
                .then(() => {
                    // Detección de soporte para Background Sync API
                    if ('serviceWorker' in navigator && 'SyncManager' in window) {
                        return navigator.serviceWorker.ready
                            .then((registro) => {
                                console.log('[Outbox] Registrando etiqueta sync-reportes en el SW...');
                                return registro.sync.register('sync-reportes');
                            });
                    }
                });
        })
        .then(() => {
            // Actualizar la lista visual en ambos escenarios
            return renderizarColaOutbox();
        });
}

// Read: Desafío 1 
function renderizarColaOutbox() {
    return obtenerTodosLosRegistros()
        .then((registros) => {
            const lista = document.getElementById('lista-outbox');

            // Limpiar la lista antes de volver a dibujarla
            lista.innerHTML = '';

            registros.forEach((item) => {
                const li = document.createElement('li');

                // La clase (pendiente / sincronizado) controla el color en styles.css
                li.className = item.estado;

                // Hora formateada a partir del timestamp guardado en fechaCreacion
                const hora = new Date(item.fechaCreacion).toLocaleTimeString();

                li.textContent = item.titulo + ' | ' + item.estado + ' | ' + hora;
                lista.appendChild(li);
            });
        })
        .catch((error) => {
            console.error('[Outbox] Error al renderizar la cola:', error);
        });
}

// Update
function sincronizarPendientesFallback() {
    console.log('[Outbox] Conexión detectada. Buscando registros pendientes...');

    return obtenerTodosLosRegistros()
        .then((registros) => {
            const pendientes = registros.filter((item) => item.estado === 'pendiente');

            if (pendientes.length === 0) {
                console.log('[Outbox] No hay transacciones pendientes por sincronizar.');
                return;
            }

            // Convertir cada registro pendiente en una promesa de envío + actualización
            const promesasDeEnvio = pendientes.map((item) => {
                return fetch('https://jsonplaceholder.typicode.com/posts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: item.titulo, body: item.descripcion })
                })
                    .then((res) => {
                        if (!res.ok) throw new Error('Falla al reintentar envío');
                        // Actualizar estado en IndexedDB de 'pendiente' a 'sincronizado'
                        return actualizarEstadoRegistro(item.id, 'sincronizado');
                    });
            });

            // Esperar a que todos los reenvíos concluyan
            return Promise.all(promesasDeEnvio);
        })
        .then(() => {
            return renderizarColaOutbox();
        })
        .catch((error) => {
            console.error('[Outbox] Error durante la sincronización masiva:', error);
        });
}

// Desafío 2 : Submit del formulario 
document.getElementById('form-incidencia').addEventListener('submit', (e) => {
    // Evitar que la página se recargue al enviar el formulario
    e.preventDefault();

    // Extraer los valores de los inputs
    const titulo = document.getElementById('titulo').value;
    const descripcion = document.getElementById('descripcion').value;

    // Enviar (o encolar si no hay red) y luego limpiar el formulario
    procesarEnvioReporte({ titulo: titulo, descripcion: descripcion })
        .then(() => {
            document.getElementById('form-incidencia').reset();
        });
});

//Desafío 3 : Delete - Purgar registros sincronizados  
document.getElementById('btn-purgar').addEventListener('click', () => {
    obtenerTodosLosRegistros()
        .then((registros) => {
            // Quedarnos solo con los ya sincronizados
            const sincronizados = registros.filter((item) => item.estado === 'sincronizado');

            // Una promesa de eliminación por registro, esperadas todas con Promise.all
            return Promise.all(
                sincronizados.map((item) => eliminarRegistro(item.id))
            );
        })
        .then(() => {
            // Redibujar la lista ya sin los sincronizados
            return renderizarColaOutbox();
        })
        .catch((error) => {
            console.error('[Outbox] Error al purgar registros:', error);
        });
});


// Escuchar el regreso de la conectividad
window.addEventListener('online', () => {
    actualizarIndicadorRed();

    // Degradación elegante: Solo sincronizar desde UI si el navegador NO soporta Background Sync (ej. Safari/iOS)
    if (!('SyncManager' in window)) {
        console.log('[Outbox] Navegador sin SyncManager. Ejecutando fallback por evento online...');
        sincronizarPendientesFallback();
    }
});

window.addEventListener('offline', actualizarIndicadorRed);


actualizarIndicadorRed();
renderizarColaOutbox();