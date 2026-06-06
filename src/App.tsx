import { useMantineColorScheme } from "@mantine/core";
import {
  AppShell,
  Box,
  Container,
  Group,
  Stack,
  Text,
  Title
} from "@mantine/core";
import { ColorSchemeToggle } from "./components/ui/ColorSchemeToggle";
import { LoadDataPanel } from "./components/workflow/LoadDataPanel";
import { FilterPanel } from "./components/workflow/FilterPanel";
import { SelectionPanel } from "./components/workflow/SelectionPanel";
import { ValidationPanel } from "./components/workflow/ValidationPanel";
import { WorkflowProvider } from "./components/contexts/WorkflowContext";
import icon from "./assets/icon.png";
import { useState, useEffect } from "react";
import { appInfo } from "./generated";

export default function App () {
  const { toggleColorScheme } = useMantineColorScheme();
  const [version, setVersion] = useState("0.x.x");

  useEffect(() => {
    appInfo()
      .then(({ version }) => setVersion(version))
      .catch((err) => {
        console.error("Failed to get app version:", err);
      });
  }, []);

  return (
    <AppShell header={{ height: 78 }} padding="lg">
      <AppShell.Header>
        <Container size="md" h="100%">
          <Group h="100%" justify="space-between">
            <Group gap="md" align="center">
              <img src={icon} alt="App Icon" width={48} />
              <Box>
                <Text fw={700}>QSAR Modeling</Text>
                <Text size="xs" tt="uppercase" fw={600} c="dimmed">
                  v{version}
                </Text>
              </Box>
            </Group>
            <ColorSchemeToggle onToggle={toggleColorScheme} />
          </Group>
        </Container>
      </AppShell.Header>

      <AppShell.Main>
        <Container size="md" py="xl">
          <Stack gap="xl">
            {/* Hero Section */}
            <Box>
              <Text c="blue" fw={600} tt="uppercase" lts={2} size="sm">
                Quantitative Activity-Structure Relationship Modeling
              </Text>
              <Title order={1} mt="lg">
                Guided Workflow
              </Title>
              <Text c="dimmed" mt="sm">
                Turn the structural descriptors and activity data of your chemical dataset into predictive QSAR models in just a few clicks. Follow the step-by-step workflow to load your data, filter descriptors, select variables, and validate your models. No coding required!
              </Text>
            </Box>

            {/* Workflow panels wrapped in context provider */}
            <WorkflowProvider>
              {/* Step 1: Load Data */}
              <LoadDataPanel />

              {/* Step 2: Filter Descriptors */}
              <FilterPanel />

              {/* Step 3: Select Variables */}
              <SelectionPanel />

              {/* Step 4: Validate Model */}
              <ValidationPanel />
            </WorkflowProvider>
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
