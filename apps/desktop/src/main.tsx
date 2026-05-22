import "@mantine/core/styles.css";
import { MantineProvider, createTheme, localStorageColorSchemeManager } from "@mantine/core";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const theme = createTheme({
  fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif",
  headings: { fontFamily: "'Space Grotesk', 'IBM Plex Sans', sans-serif" },
  primaryColor: "teal",
  defaultRadius: "md",
});

const colorSchemeManager = localStorageColorSchemeManager({ key: "qsar-color-scheme" });

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light" colorSchemeManager={colorSchemeManager}>
      <App />
    </MantineProvider>
  </React.StrictMode>,
);
