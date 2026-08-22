import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  direction: 'rtl',
  palette: {
    mode: 'light',
    primary: {
      main: '#0F766E', // Primary Teal
      light: '#14B8A6',
      dark: '#0D9488',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#14B8A6', // Light Teal / Cyan
      light: '#2DD4BF',
      dark: '#0F766E',
      contrastText: '#ffffff',
    },
    background: {
      default: '#F8FAFC',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#0F172A',
      secondary: '#64748B',
    },
    divider: '#E2E8F0',
  },
  typography: {
    fontFamily: ['Cairo', 'system-ui', '-apple-system', 'sans-serif'].join(','),
    h1: { fontWeight: 800, fontSize: 'clamp(1.75rem, 3vw, 2.25rem)', lineHeight: 1.25 },
    h2: { fontWeight: 700, fontSize: 'clamp(1.5rem, 2.5vw, 1.875rem)', lineHeight: 1.3 },
    h3: { fontWeight: 700, fontSize: 'clamp(1.25rem, 2vw, 1.5rem)', lineHeight: 1.35 },
    h4: { fontWeight: 700, fontSize: 'clamp(1.1rem, 1.8vw, 1.25rem)', lineHeight: 1.4 },
    h5: { fontWeight: 600, fontSize: '1rem', lineHeight: 1.4 },
    h6: { fontWeight: 600, fontSize: '0.875rem', lineHeight: 1.4 },
    body1: { fontSize: '0.875rem', lineHeight: 1.5 },
    body2: { fontSize: '0.8125rem', lineHeight: 1.5 },
    button: { fontWeight: 700, fontSize: '0.8125rem' },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 10,
          fontWeight: 700,
          fontSize: '13px',
          padding: '6px 14px',
          minHeight: 36,
          boxShadow: 'none',
          fontFamily: 'inherit',
          transition: 'all 0.15s ease',
          '&:hover': {
            boxShadow: '0 2px 8px rgba(15, 118, 110, 0.15)',
          },
        },
        sizeSmall: {
          minHeight: 32,
          padding: '4px 10px',
          fontSize: '12px',
        },
        sizeLarge: {
          minHeight: 40,
          padding: '8px 18px',
          fontSize: '14px',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 12,
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px 0 rgba(0, 0, 0, 0.02)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px 0 rgba(0, 0, 0, 0.02)',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 14,
          margin: 12,
          width: 'min(calc(100vw - 24px), 640px)',
          maxWidth: '100%',
          maxHeight: 'calc(100vh - 24px)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          padding: '16px 20px',
          fontSize: '16px',
          fontWeight: 800,
          borderBottom: '1px solid #F1F5F9',
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          padding: '16px 20px',
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding: '12px 20px',
          gap: 8,
          borderTop: '1px solid #F1F5F9',
          flexWrap: 'wrap',
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: 6,
          transition: 'all 0.15s ease',
        },
        sizeSmall: {
          padding: 4,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 42,
          fontSize: '13px',
          fontWeight: 700,
          padding: '8px 14px',
          textTransform: 'none',
          fontFamily: 'inherit',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: '#F1F5F9',
          padding: '10px 14px',
          fontSize: '13px',
        },
        head: {
          fontWeight: 700,
          fontSize: '12.5px',
          color: '#475569',
          backgroundColor: '#F8FAFC',
          whiteSpace: 'nowrap',
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        size: 'small',
      },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 10,
            fontSize: '13px',
          },
        },
      },
    },
    MuiFormControl: {
      defaultProps: {
        size: 'small',
      },
    },
  },
});
