import { Button, type ButtonProps } from '@mui/material'

// Estándar de botones del proyecto: mismo alto (chico) en toda la
// plataforma, empezando por Exportar / Registrar pago / Generar cargos
// del mes.
//
// Usamos `height` fijo, NO `min-height`: el contenido interno del
// <Button> (flex + line-height, sin el ripple, que va aparte con
// position:absolute) estaba auto-calculando un alto mayor a 30px, así
// que un mínimo de 30 nunca hacía nada — el contenido ya "quería" ser
// más alto que el piso. Con `height` fijo el navegador deja de calcular
// el alto por contenido y el texto simplemente queda centrado adentro
// (ya tenemos alignItems: center de fábrica en el Button).
export function AppButton({ sx, ...props }: ButtonProps) {
  return (
    <Button
      size="small"
      sx={{
        height: 32,
        px: 1.75,
        ...sx,
      }}
      {...props}
    />
  )
}
