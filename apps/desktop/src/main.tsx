import "@mantine/core/styles.css";
import { MantineProvider, localStorageColorSchemeManager } from "@mantine/core";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { theme } from "./theme";


const colorSchemeManager = localStorageColorSchemeManager({ key: "qsar-color-scheme" });

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light" colorSchemeManager={colorSchemeManager}>
      <App />
    </MantineProvider>
  </React.StrictMode>,
);
