import { Sidebar, type SidebarProps } from 'react-admin'

// Menú lateral estático: sin botón para expandir/colapsar y con el
// mismo ancho siempre, en cualquier tamaño de pantalla.
//
// El <Sidebar> de react-admin decide "permanent" (dock fijo) vs
// "temporary" (drawer flotante que se abre/cierra) según el ancho de
// pantalla, y calcula su ancho a partir de un estado `open` que solo
// cambia cuando algo llama a setOpen — normalmente el botón que
// sacamos del topbar. Reenviamos `variant="permanent"` y `open` acá
// como props: como <Sidebar> hace `{...rest}` DESPUÉS de fijar esos
// mismos valores internamente, lo que pasamos nosotros gana y el
// resultado es un dock fijo, siempre abierto, sin importar el tamaño
// de pantalla ni el estado guardado de intentos anteriores de
// togglearlo.
export function AppSidebar(props: SidebarProps) {
  return (
    <Sidebar
      {...props}
      open
      variant="permanent"
      sx={{
        // Línea divisoria entre el menú y el contenido: gris suave (el
        // mismo token "divider" del tema), 1px, y arranca un poco más
        // abajo del borde inferior del menú superior (que mide 48px) en
        // vez de tocarlo — de ahí el `top: 16` en vez de 0.
        '& .MuiDrawer-paper': {
          position: 'relative',
          '&::after': {
            content: '""',
            position: 'absolute',
            top: 16,
            right: 0,
            bottom: 0,
            width: '1px',
            backgroundColor: 'divider',
          },
        },
      }}
    />
  )
}
