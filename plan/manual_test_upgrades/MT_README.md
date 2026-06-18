# Manual test upgrades

- [x] **1. Unified pending-investment modal (post-subscribe + tap)**

  Cuando un usuario invierte en un fondo, una vez que se procesa y redirige al home screen, debería salir un modal estilizado indicando que la orden fue creada con éxito, que está siendo procesada y que la asignación puede demorar hasta 72 horas hábiles. El mismo modal debe mostrarse al tocar una orden de inversión pendiente (reemplazando el copy anterior de "Investment processing" / TronScan).

- [x] **2. Admin sidebar pending-orders badge**

  En el sidebar del admin panel, mostrar un badge con el número total de órdenes pendientes (inversiones manuales + retiros + referidos), alineado con el conteo de la página Orders.

- [x] **3. Email + push + PDF receipt on investment approval**

  Cuando admin marca una orden como exitosa (`MARK ORDER SUCCESS` / `completeOrder`), enviar push conciso y email con más detalle confirmando la aprobación, indicando que estamos trabajando para hacer crecer el dinero del usuario, e incluir el receipt PDF como adjunto.
