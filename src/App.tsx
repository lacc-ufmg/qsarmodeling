import { useMantineColorScheme } from "@mantine/core";
import {
  Alert,
  AppShell,
  Box,
  Container,
  Group,
  Stack,
  Text,
  Title
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { useQsarWorkflow } from "./hooks/useQsarWorkflow";
import { ColorSchemeToggle } from "./components/ui/ColorSchemeToggle";
import { LoadDataPanel } from "./components/workflow/LoadDataPanel";
import { FilterPanel } from "./components/workflow/FilterPanel";
import { SelectionPanel } from "./components/workflow/SelectionPanel";
import { ValidationPanel } from "./components/workflow/ValidationPanel";
import { WorkflowTimeline } from "./components/workflow/WorkflowTimeline";
import icon from "./assets/icon.png";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export default function App () {
  const { toggleColorScheme } = useMantineColorScheme();
  const { state, actions, selectors } = useQsarWorkflow();
  const [version, setVersion] = useState("0.x.x");

  useEffect(() => {
    invoke("app_info")
      .then(({version}: any) => setVersion(version))
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

            {/* Error Alert */}
            {state.error && (
              <Alert
                icon={<IconAlertCircle size="1rem" />}
                title="Error"
                color="red"
              >
                {state.error}
              </Alert>
            )}

            {/* Step 1: Load Data */}
            <LoadDataPanel
              matrixFilePath={state.matrixFilePath}
              vectorFilePath={state.vectorFilePath}
              uploadedDataset={state.uploadedDataset}
              isLoading={state.busyState === "loading-data"}
              isDisabled={!selectors.canLoadData}
              onSelectMatrixFile={actions.selectMatrixFile}
              onSelectVectorFile={actions.selectVectorFile}
              onClearMatrixFile={actions.clearMatrixFile}
              onClearVectorFile={actions.clearVectorFile}
              onLoad={actions.loadData}
            />

            {/* Step 2: Filter Descriptors */}
            <FilterPanel
              uploadedDataset={state.uploadedDataset}
              activeDataset={state.activeDataset}
              filterSettings={state.filterSettings}
              isLoading={state.busyState === "filtering"}
              isDisabled={!selectors.canRunFilters}
              onSettingsChange={actions.updateFilterSettings}
              onRunFilters={actions.runDescriptorFilters}
            />

            {/* Step 3: Select Variables */}
            <SelectionPanel
              activeDataset={state.activeDataset}
              selectionResult={state.selectionResult}
              selectionSettings={state.selectionSettings}
              isLoading={state.busyState === "selecting"}
              isDisabled={!selectors.canRunSelection}
              onSettingsChange={actions.updateSelectionSettings}
              onRunSelection={actions.runVariableSelection}
            />

            {/* Step 4: Validate Model */}
            <ValidationPanel
              selectionResult={Boolean(state.selectionResult)}
              validationResult={state.validationResult}
              validationSettings={state.validationSettings}
              isLoading={state.busyState === "validating"}
              isValidating={state.busyState === "validating"}
              isPipelineRunning={state.busyState !== "idle" && state.busyState !== "validating"}
              isDisabled={!selectors.canRunValidation}
              canRunPipeline={selectors.canRunPipeline}
              onSettingsChange={actions.updateValidationSettings}
              onRunValidation={actions.runValidationSuite}
              onRunPipeline={actions.runFullPipeline}
            />

            {/* Workflow Timeline */}
            <WorkflowTimeline history={state.history} />
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
