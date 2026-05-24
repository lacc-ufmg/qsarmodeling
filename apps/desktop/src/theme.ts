// theme.ts
import {
  createTheme,
  DEFAULT_THEME,
  mergeMantineTheme,
} from '@mantine/core';

const themeOverride = createTheme({
  fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif",
  headings: { fontFamily: "'Space Grotesk', 'IBM Plex Sans', sans-serif" },
  defaultRadius: "md",
});

export const theme = mergeMantineTheme(DEFAULT_THEME, themeOverride);
