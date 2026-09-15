import { defaultTheme, defaultDarkTheme } from 'react-admin'
import { deepmerge } from '@mui/utils'

// Paleta "Modernist" tal como la definió Claude Design para el panel:
// fondo/superficie neutros, tinta casi negra, un único acento rojo
// (#ec3013) reservado para la acción primaria, el ítem activo del menú
// y las cifras críticas — todo lo demás vive en la escala de neutros.
// Sin radios, reglas de 2px, tipografía Sora.
const red = {
  100: '#fff2ef',
  200: '#ffe0d9',
  300: '#ffc4b8',
  400: '#ff9783',
  500: '#ff563c',
  600: '#dd2b0f', // hover
  700: '#ae1800', // texto sobre fondo claro
  800: '#7c1405',
  900: '#4d170e',
  base: '#ec3013',
}

const neutral = {
  100: '#f8f4f4',
  200: '#eae7e7',
  300: '#d7d3d3',
  400: '#bab6b6',
  500: '#9b9797',
  600: '#7d7979',
  700: '#605d5d',
  800: '#444141',
  900: '#2d2b2b',
}

const fontFamily = '"Sora", system-ui, sans-serif'

// El sistema es deliberadamente de un solo acento: no hay verde de éxito
// ni ámbar de advertencia inventados aparte del rojo. "Pagado" queda en
// tinta neutra (es el estado esperado, no necesita color); "pendiente"
// toma un rojo claro de la misma rampa y "vencido"/crítico usa el 700,
// que es el que da suficiente contraste como texto.
export const lightTheme = deepmerge(defaultTheme, {
  palette: {
    mode: 'light',
    primary: { main: red.base, light: red[400], dark: red[600], contrastText: '#FFFFFF' },
    secondary: { main: neutral[700], contrastText: '#FFFFFF' },
    error: { main: red[700] },
    warning: { main: red[500], contrastText: '#FFFFFF' },
    success: { main: neutral[800], contrastText: '#FFFFFF' },
    background: { default: '#f3f2f2', paper: '#eae9e9' },
    text: { primary: '#201e1d', secondary: neutral[600] },
    divider: 'rgba(32, 30, 29, 0.4)',
  },
  shape: { borderRadius: 0 },
  typography: { fontFamily, button: { textTransform: 'none', fontWeight: 600 } },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 0 },
        outlined: { borderWidth: 2, '&:hover': { borderWidth: 2 } },
      },
    },
    MuiPaper: { styleOverrides: { root: { borderRadius: 0 } } },
    MuiDivider: { styleOverrides: { root: { borderBottomWidth: 2 } } },
    MuiTextField: { defaultProps: { variant: 'outlined' } },
    MuiOutlinedInput: { styleOverrides: { notchedOutline: { borderWidth: 2 } } },
  },
})

// Sin especificación de modo oscuro en la paleta "Modernist" (es un
// sistema pensado como una hoja clara, tipo impreso) — este oscuro es
// una inversión razonable para cuando react-admin lo activa, usando la
// misma rampa de rojo corrida hacia los tonos que sí leen bien sobre
// fondo oscuro.
export const darkTheme = deepmerge(defaultDarkTheme, {
  palette: {
    mode: 'dark',
    primary: { main: red[500], light: red[400], dark: red.base, contrastText: '#201e1d' },
    secondary: { main: neutral[400], contrastText: '#201e1d' },
    error: { main: red[400] },
    warning: { main: red[300], contrastText: '#201e1d' },
    success: { main: neutral[300], contrastText: '#201e1d' },
    background: { default: neutral[900], paper: '#231f1f' },
    text: { primary: '#f8f4f4', secondary: neutral[400] },
    divider: 'rgba(248, 244, 244, 0.3)',
  },
  shape: { borderRadius: 0 },
  typography: { fontFamily, button: { textTransform: 'none', fontWeight: 600 } },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 0 },
        outlined: { borderWidth: 2, '&:hover': { borderWidth: 2 } },
      },
    },
    MuiPaper: { styleOverrides: { root: { borderRadius: 0 } } },
    MuiDivider: { styleOverrides: { root: { borderBottomWidth: 2 } } },
    MuiTextField: { defaultProps: { variant: 'outlined' } },
    MuiOutlinedInput: { styleOverrides: { notchedOutline: { borderWidth: 2 } } },
  },
})
