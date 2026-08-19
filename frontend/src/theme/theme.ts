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
    h1: { fontWeight: 800, fontSize: '2.25rem' },
    h2: { fontWeight: 700, fontSize: '1.875rem' },
    h3: { fontWeight: 700, fontSize: '1.5rem' },
    h4: { fontWeight: 700, fontSize: '1.25rem' },
    h5: { fontWeight: 600, fontSize: '1.125rem' },
    h6: { fontWeight: 600, fontSize: '1rem' },
    button: { fontWeight: 700 },
  },
  shape: {
    borderRadius: 16,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 12,
          fontWeight: 700,
          padding: '8px 20px',
          minHeight: 42,
          boxShadow: 'none',
          '@media (max-width:600px)': { minHeight: 46, width: '100%' },
          '&:hover': {
            boxShadow: '0 4px 12px rgba(15, 118, 110, 0.15)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 16,
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
          '@media (max-width:600px)': {
            margin: 12,
            width: 'calc(100% - 24px)',
            maxWidth: '100%',
            maxHeight: 'calc(100% - 24px)',
            height: 'auto',
            borderRadius: 12,
          },
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding: '16px 24px',
          gap: 8,
          '@media (max-width:600px)': {
            flexDirection: 'column-reverse',
            '& > :not(style)': { width: '100%', marginLeft: 0 },
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        // Comfortable touch target — 34px icon buttons were below the 44px guideline.
        root: { '@media (max-width:900px)': { minWidth: 44, minHeight: 44 } },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { minHeight: 46, '@media (max-width:600px)': { minHeight: 48, fontSize: 13 } },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: '#F1F5F9',
          padding: '12px 16px',
        },
        head: {
          fontWeight: 700,
          color: '#475569',
          backgroundColor: '#F8FAFC',
        },
      },
    },
  },
});
