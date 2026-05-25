# 7. Pruebas

## 7.1 Estrategia de pruebas

Dado que el proyecto no dispone de un framework de tests automatizados —decisión justificada en la sección 4 por la naturaleza iterativa del desarrollo y el perfil de usuario único que ostenta el desarrollador— la verificación del sistema se sustenta en dos pilares complementarios: pruebas manuales por flujo y sesiones de pruebas de usuario (*user testing*).

Las **pruebas manuales por flujo** consisten en la ejecución completa de cada caso de uso identificado en la sección 3 sobre el dispositivo físico y el entorno de Expo Go conectado a los servicios reales de Supabase y Stripe en modo test. Se cubre tanto el camino feliz (*happy path*) como las variantes de error más probables: pago cancelado, reserva ya comenzada, fechas solapadas o sesión expirada.

Las **pruebas de usuario** se realizaron en una sesión presencial con el propietario del área como usuario representativo del rol administrador y con el propio desarrollador actuando como camperista durante el ciclo completo de reserva, modificación y cancelación. El propósito de estas sesiones es detectar problemas de comportamiento que las pruebas técnicas no anticipan: flujos que se interrumpen inesperadamente, pantallas que no muestran la información que el usuario espera, o interacciones que producen resultados contrarios a la intuición.

> 📊 **[Insertar tabla resumen de casos de prueba por flujo: flujo / resultado esperado / resultado obtenido / estado. Fuente: elaboración propia.]**

---

## 7.2 Incidencias detectadas en pruebas de usuario

Las sesiones de *user testing* pusieron de manifiesto siete incidencias que afectaban a la usabilidad o a la corrección funcional de la aplicación. Se documentan a continuación con su identificador, severidad, descripción del síntoma observado, causa raíz identificada y solución aplicada.

| ID | Área afectada | Severidad | Estado |
|----|---------------|-----------|--------|
| P-01 | Flujo de pago (creación) | Crítica | Resuelta |
| P-02 | Navegación post-pago | Alta | Resuelta |
| P-03 | Lista de reservas | Alta | Resuelta |
| P-04 | Interacción táctil en lista | Media | Resuelta |
| P-05 | Flujo de pago (modificación) | Crítica | Resuelta |
| P-06 | Pantalla de edición | Alta | Resuelta |
| P-07 | Detalle de reserva | Media | Resuelta |
| P-08 | Navegación post-modificación | Alta | Resuelta |
| P-09 | Gestión de vehículos en edición | Alta | Resuelta |
| P-10 | Desglose de precios en edición | Media | Resuelta |

### P-01 — Pantalla de error genérica tras completar el pago

**Síntoma.** Al completar el pago en Stripe Checkout, la aplicación mostraba la pantalla de error genérica de Expo Router en lugar de navegar al detalle de la reserva. El camperista veía el mensaje "Something went wrong" sin ninguna indicación del estado de su pago.

**Causa raíz.** La edge function `create-checkout-session` construía la URL de retorno a partir de la variable de entorno de servidor `EXPO_GO_BASE_URL`. Esta variable contenía la dirección base del túnel de Expo Go de una sesión anterior. En Expo Go, el host del esquema de navegación profunda (*deep link*) cambia en cada sesión de desarrollo porque el túnel se regenera; por tanto, la URL almacenada en el servidor quedaba desincronizada respecto al esquema activo en el dispositivo. Cuando Stripe redirigía al `return_url` tras el pago, la URL no coincidía con ninguna ruta registrada en Expo Router y el framework mostraba el error genérico.

**Solución.** Se trasladó la responsabilidad de generar la URL de retorno al cliente. Justo antes de abrir el navegador de Stripe, la pantalla `reservation-summary.tsx` genera `redirectBase = Linking.createURL('/stripe-redirect')`, que produce automáticamente el esquema y host correctos para el entorno activo (túnel de desarrollo o esquema de producción `tfg-info-areacamper://`). Este valor se pasa como parámetro `return_url` al cuerpo de la invocación a la edge function. El servidor lo transporta sin modificarlo hasta la `success_url` de Stripe. Se creó además la ruta `/stripe-redirect` (`app/stripe-redirect.tsx`) para absorber el *deep link* de retorno y navegar al detalle de la reserva correspondiente. La llamada al navegador se cambió de `openBrowserAsync` a `openAuthSessionAsync`, que intercepta internamente el *deep link* de retorno sin dispararlo como intent del sistema operativo.

---

### P-02 — El botón "Volver" desde el detalle de reserva navegaba a la pestaña de Servicios

**Síntoma.** Tras completar el pago y llegar al detalle de la reserva, pulsar el botón "‹ Volver" llevaba a la pestaña de Servicios en lugar de a la lista de reservas del camperista.

**Causa raíz.** La navegación post-pago usaba `router.replace()` para llegar al detalle de la reserva. Esta operación sustituye la entrada actual en la pila de navegación y no añade una entrada previa. En consecuencia, la pila quedaba con una sola entrada y `router.back()` no tenía destino válido, delegando el control al navegador de pestañas, que recordaba la última pestaña activa (Servicios).

**Solución.** Se reemplazó la llamada incondicional a `router.back()` por la expresión `router.canGoBack() ? router.back() : router.replace('/(main)/qr')`. De este modo, si existe historial de navegación se usa el mecanismo estándar de retroceso; en caso contrario, la pantalla navega explícitamente a la lista de reservas.

---

### P-03 — La lista de reservas no se actualizaba tras cancelar una reserva

**Síntoma.** Después de cancelar una reserva desde la pantalla de detalle y volver a la lista, la reserva seguía apareciendo en la sección "Próximas" con estado *Pagada*. Solo tras cerrar completamente la aplicación y relanzarla se mostraba la reserva como *Cancelada* en la sección correspondiente.

**Causa raíz.** El gancho de carga de datos de la lista de reservas (`app/(main)/qr/index.tsx`) usaba `useEffect` con un array de dependencias vacío, lo que limita su ejecución al montaje inicial del componente. Al tratarse de una pestaña del navegador inferior, la pantalla permanece montada continuamente en memoria y no se desmonta al navegar a otras rutas. Por tanto, al regresar desde el detalle, el efecto no se volvía a ejecutar y los datos permanecían en el estado previo a la cancelación.

**Solución.** Se sustituyó `useEffect` por `useFocusEffect` de `@react-navigation/native`, que ejecuta el callback de carga cada vez que la pantalla gana el foco, independientemente de si el componente se monta de nuevo o simplemente vuelve a ser visible. Para evitar el problema de la referencia obsoleta (*stale closure*) dentro del callback estabilizado con `useCallback`, se introdujo un `useRef` sincronizado con el estado actual del identificador de reserva seleccionada.

---

### P-04 — Un único toque sobre una reserva abría el detalle directamente

**Síntoma.** Al tocar sobre una reserva en la lista, la aplicación navegaba inmediatamente a la pantalla de detalle. El camperista esperaba que el primer toque seleccionara la reserva —actualizando el código QR visible en la parte superior— y que solo el segundo toque, sobre la misma reserva ya seleccionada, abriera el detalle.

**Causa raíz.** El manejador `onPress` del componente `ReservationItem` ejecutaba directamente `router.push()` sin comprobar si la reserva ya estaba seleccionada. El comportamiento de doble interacción (seleccionar primero, navegar después) existía en una versión anterior de la pantalla pero se perdió durante una refactorización del flujo de navegación.

**Solución.** El manejador `onPress` se modificó para distinguir ambos estados: si la reserva no está seleccionada, llama a `setSelectedId(r.id)` y actualiza el QR; si ya está seleccionada, navega al detalle con `router.push()`. Esta lógica reproduce la interacción que el propietario había descrito como intuitiva durante la sesión de pruebas.

---

### P-05 — El flujo de modificación con pago adicional no retornaba correctamente

**Síntoma.** Al modificar una reserva incrementando las noches (delta positivo), la aplicación abría Stripe Checkout correctamente. Sin embargo, al completar el pago, el navegador externo no retornaba a la aplicación: el camperista quedaba en la pantalla web de confirmación de Stripe sin poder volver.

**Causa raíz.** La pantalla `edit.tsx` usaba `WebBrowser.openBrowserAsync` para abrir Stripe. A diferencia de `openAuthSessionAsync`, esta función abre un navegador externo completo que no intercede en los *deep links* de retorno: el sistema operativo recibe el *deep link* pero lo procesa como una URL abierta desde el navegador, lo que en muchos casos lo descarta o lo ignora si no hay una app registrada para ese esquema en ese momento. Adicionalmente, la edge function `modify-reservation` construía la URL de éxito de Stripe con `EXPO_GO_BASE_URL` al igual que ocurría en P-01, con el mismo problema de desincronización de esquemas.

**Solución.** Se aplicaron las mismas correcciones que en P-01 al flujo de modificación: generación de `return_url` en el cliente (`Linking.createURL('/stripe-redirect')`), paso del valor como parámetro en la invocación a `modify-reservation`, inclusión en la `success_url` de Stripe, y sustitución de `openBrowserAsync` por `openAuthSessionAsync` en `edit.tsx`. Se actualizó también la edge function `stripe-success` para utilizar `return_url` en ambos modos (`create` y `modify`), eliminando la dependencia de `EXPO_GO_BASE_URL` en los dos flujos de pago. Estas correcciones se desplegaron como versión 5 de `modify-reservation` y versión 40 de `stripe-success`.

---

### P-06 — La pantalla de edición no permitía modificar datos por plaza

**Síntoma.** La pantalla de modificación de reserva (`edit.tsx`) únicamente ofrecía controles para cambiar el número de noches, un único vehículo y un listado de extras sin distinción de plaza. En reservas con más de una plaza, no era posible cambiar el vehículo de la segunda plaza, registrar viajeros por plaza de forma independiente ni ajustar el número de mascotas o la contratación de electricidad por plaza individualmente.

**Causa raíz.** La pantalla fue implementada antes de que se introdujera el modelo de datos por plaza en la aplicación: la tabla `travelers` con su columna `place_index` y la columna `place_index` en `reservation_extras` se añadieron en una iteración posterior del desarrollo. La pantalla de edición nunca se actualizó para incorporar este modelo.

**Solución.** Se reescribió completamente la pantalla `edit.tsx`. La nueva versión carga desde la base de datos los viajeros actuales agrupados por `place_index`, los extras de la reserva con su `place_index` correspondiente y el `vehicles_snapshot` con el vehículo asignado a cada plaza. El formulario presenta una pestaña por plaza (visible cuando hay más de una) que contiene: selector de vehículo del usuario, contadores de viajeros, mascotas y electricidad, y un formulario completo por viajero con los mismos campos que el flujo de nueva reserva. El desglose de precios se recalcula en tiempo real por plaza. Para el caso delta positivo (pago adicional), los datos de viajeros y el `vehicles_snapshot` actualizado se almacenan en `AsyncStorage` antes de abrir Stripe y se aplican en la base de datos en cuanto `openAuthSessionAsync` confirma el retorno exitoso.

---

### P-07 — El detalle de reserva no mostraba el resumen agrupado por plaza

**Síntoma.** La pantalla de detalle de reserva (`[reservationId]/index.tsx`) presentaba vehículos, viajeros y extras como listas planas. En reservas con varias plazas, no había ninguna indicación visual de qué vehículo, qué viajeros y qué extras correspondían a cada plaza, lo que dificultaba la comprensión del resumen por parte del camperista.

**Causa raíz.** La pantalla fue diseñada con el modelo de una sola plaza y no se actualizó cuando se extendió el sistema para soportar múltiples plazas con datos independientes por plaza.

**Solución.** Se reestructuró la pantalla de detalle para agrupar toda la información relativa a cada plaza en una sección visual diferenciada. Cuando la reserva tiene más de una plaza, aparece un encabezado "Plaza X" en azul antes de cada bloque, que incluye la tarjeta de vehículo, la tarjeta de viajeros (con todos los campos registrados) y la tarjeta de extras filtrados por `place_index`. El desglose económico también se desglosa por plaza cuando procede, mostrando base nocturna y extras por plaza antes del total global. La consulta a `reservation_extras` se amplió para incluir `place_index`, permitiendo el filtrado correcto. Se mantiene compatibilidad con reservas antiguas sin `place_index` en extras, que se muestran asociadas a la primera plaza.

---

### P-08 — La navegación post-modificación dirigía a la pestaña de Servicios

**Síntoma.** Al confirmar una modificación de reserva (pantalla `edit.tsx`), la aplicación navegaba a la pestaña de Servicios en lugar de mostrar el detalle de la reserva modificada. Adicionalmente, en iteraciones posteriores del arreglo, el botón "‹ Volver" del detalle de reserva conducía de nuevo a Servicios y la pestaña "Mis Viajes" mostraba el detalle de la reserva en lugar de la lista de reservas.

**Causa raíz.** El flujo de modificación finalizaba llamando a `router.back()`. Cuando la pantalla `edit` se abría en una pila de navegación sin entradas previas —lo que ocurre, por ejemplo, si el usuario llega al detalle mediante un enlace directo o tras ciertas secuencias de navegación internas—, `router.back()` no tenía destino válido dentro del *stack* de `/(main)/qr` y el navegador delegaba el retroceso al nivel superior (el navegador de pestañas), que recordaba Servicios como última pestaña activa. Los intentos de corrección intermedios que usaban `router.replace` o `router.navigate` directamente al detalle de la reserva producían un *stack* de navegación con únicamente la pantalla de detalle como raíz (`[detalle]`), sin la lista por debajo, lo que impedía tanto el funcionamiento del botón "‹ Volver" como el comportamiento esperado del tab al presionarlo.

**Solución.** Se sustituyó la navegación final por una secuencia en dos pasos: primero `router.replace('/(main)/qr')`, que establece la lista de reservas como raíz del *stack* del tab, y acto seguido —en el siguiente ciclo del *event loop* mediante `setTimeout(fn, 0)`, instante en que el cambio de estado de navegación ya se ha procesado— `router.push(\`/(main)/qr/${id}\`)`, que apila el detalle de la reserva sobre la lista. El *stack* resultante (`[lista, detalle]`) permite que el botón "‹ Volver" retroceda a la lista mediante `router.back()`, que la pestaña "Mis Viajes" muestre la lista al ser presionada desde otra pestaña, y que al presionarla estando ya en el detalle (pestaña activa) React Navigation resetee al *initial route* de ese *stack*, que es la lista.

---

### P-09 — La pantalla de edición no permitía gestionar el vehículo de los acompañantes ni crear vehículos nuevos

**Síntoma.** En la pantalla de modificación de reserva, el selector de vehículo de las plazas de acompañante mostraba la lista de vehículos registrados por el usuario, cuando los datos del vehículo del acompañante no están en dicha lista sino en el campo `vehicles_snapshot` de la reserva. En consecuencia, no era posible consultar ni corregir los datos del vehículo acompañante (marca, modelo, matrícula) sin salir de la pantalla. Para la plaza del titular tampoco existía la opción de crear y registrar un vehículo nuevo directamente desde el flujo de modificación.

**Causa raíz.** La pantalla `edit.tsx` utilizaba un único componente de selección de vehículo —una lista de los vehículos del usuario en la tabla `vehicles`— para todas las plazas, sin distinguir entre la plaza del titular (plaza 0) y las plazas de acompañantes (plaza > 0). Los datos de vehículo de las plazas de acompañante, almacenados en el JSON `vehicles_snapshot` de la reserva, nunca se exponían al usuario para su edición.

**Solución.** Se implementaron dos comportamientos diferenciados según el índice de plaza. Para la plaza 0 (titular) se mantiene el selector de vehículos registrados —con *checkmark* sobre el elemento activo— y se añade un botón "＋ Añadir nuevo vehículo" que despliega un formulario *inline* con los campos marca, modelo y matrícula (obligatorios) y alias y longitud en metros (opcionales); al confirmar, el vehículo se inserta en la tabla `vehicles` del usuario, aparece seleccionado automáticamente y el formulario se cierra. Para las plazas de acompañante (plaza > 0) el selector se sustituye por un conjunto de campos de texto libres (marca, modelo, matrícula, alias, longitud) prellenos con los valores del `vehicles_snapshot` correspondiente a esa plaza; los cambios solo actualizan el snapshot de la reserva, sin crear entradas en la tabla `vehicles`, de acuerdo con la semántica de datos del sistema.

---

### P-10 — El desglose de precios en la pantalla de edición no segmentaba por plaza

**Síntoma.** La tarjeta de desglose económico de la pantalla de edición omitía el encabezado "Plaza X" y las líneas de subtotal cuando la reserva tenía una sola plaza, y solo los mostraba cuando había más de una. El resultado era una presentación inconsistente respecto al detalle de reserva y al resumen de nueva reserva, donde el desglose siempre aparece organizado por plaza.

**Causa raíz.** La condición `placeStates.length > 1` envolvía tanto el encabezado de plaza como la fila de subtotal en el bucle de renderizado, de modo que con una sola plaza ninguno de los dos elementos se renderizaba.

**Solución.** Se eliminó la condición condicional y se estableció que el bucle siempre genere una sección "Plaza X" con sus líneas de coste (base nocturna, mascotas, electricidad, viajeros extra) y su fila de subtotal. Bajo el bucle se añadió una sección separada con borde superior que recoge el total original, el total nuevo calculado y la diferencia delta coloreada (azul para pago adicional, rojo para reembolso, gris para sin cambio), logrando coherencia visual con el resto de pantallas de la aplicación.

---

## 7.3 Valoración del proceso de pruebas

Las diez incidencias documentadas comparten dos patrones recurrentes. El primero es la integración entre componentes que evolucionaron en momentos distintos del desarrollo: las pantallas de edición y detalle de reserva se diseñaron antes de que el modelo de datos incorporara el soporte por plaza (`place_index` en `travelers` y `reservation_extras`, `vehicles_snapshot` por plaza), y nunca se actualizaron de forma completa hasta que las pruebas pusieron de manifiesto las carencias (P-06, P-07, P-09, P-10). El segundo patrón es la complejidad del modelo de navegación de Expo Router cuando se combina con flujos de pago externos: la asunción implícita de que siempre existe una pila de navegación válida hacia atrás se violó repetidamente en los puntos donde el control salía de la aplicación (Stripe Checkout) o donde la pantalla de destino se encontraba en un *stack* distinto del esperado (P-01, P-02, P-05, P-08).

Las incidencias P-03 y P-04 no habrían aflorado con pruebas técnicas aisladas por flujo: ambas requieren observar el comportamiento del usuario al encadenar acciones en orden real (cancelar y volver a la lista; tocar una reserva con la expectativa de seleccionar antes que navegar). La incidencia P-08, en su variante más sutil —el botón "‹ Volver" del detalle conduciendo al tab incorrecto tras una secuencia específica de pasos—, tampoco es reproducible sin ejecutar el flujo completo de modificación incluyendo la navegación posterior. Estos resultados refuerzan el valor de incorporar sesiones de uso supervisado, incluso en proyectos de alcance reducido, como complemento a la verificación técnica.

Todas las incidencias detectadas se resolvieron antes de la entrega final. El estado del sistema tras las correcciones se verificó ejecutando de nuevo los flujos completos sobre el entorno de desarrollo con datos de prueba en Stripe.
