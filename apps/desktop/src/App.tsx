import { useMantineColorScheme } from "@mantine/core";
import {
  Alert,
  AppShell,
  Box,
  Container,
  Group,
  Stack,
  Text,
  Title,
  ThemeIcon,
} from "@mantine/core";
import { IconAlertCircle, IconFlask } from "@tabler/icons-react";
import { useQsarWorkflow } from "./hooks/useQsarWorkflow";
import { ColorSchemeToggle } from "./components/ui/ColorSchemeToggle";
import { LoadDataPanel } from "./components/workflow/LoadDataPanel";
import { FilterPanel } from "./components/workflow/FilterPanel";
import { SelectionPanel } from "./components/workflow/SelectionPanel";
import { ValidationPanel } from "./components/workflow/ValidationPanel";
import { WorkflowTimeline } from "./components/workflow/WorkflowTimeline";

export default function App() {
  const { toggleColorScheme } = useMantineColorScheme();
  const { state, actions, selectors } = useQsarWorkflow();

  return (
    <AppShell header={{ height: 78 }} padding="lg">
      <AppShell.Header>
        <Container size="lg" h="100%">
          <Group h="100%" justify="space-between">
            <Group gap="md" align="center">
              <ThemeIcon radius="md" size="lg" variant="light" color="teal">
                <IconFlask size={18} />
              </ThemeIcon>
              <Box>
                <Text size="xs" tt="uppercase" fw={600} c="dimmed">
                  Guided workflow
                </Text>
                <Text fw={700}>QSAR Model Builder</Text>
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
                Guided workflow
              </Text>
              <Title order={1} mt="xs">
                QSAR Model Builder
              </Title>
              <Text c="dimmed" mt="sm">
                A guided workflow for QSAR model development. Follow the steps in order,
                and we&apos;ll help you at each stage with sensible defaults and detailed
                explanations.
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
              matrixFile={state.matrixFile}
              vectorFile={state.vectorFile}
              uploadedDataset={state.uploadedDataset}
              isLoading={state.busyState === "loading-data"}
              isDisabled={!selectors.canLoadData}
              onMatrixFileChange={actions.setMatrixFile}
              onVectorFileChange={actions.setVectorFile}
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
              activeDataset={Boolean(state.activeDataset)}
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
