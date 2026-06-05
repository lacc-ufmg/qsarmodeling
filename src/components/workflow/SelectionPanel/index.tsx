import { Paper, Badge, SegmentedControl, Group, Stack, Text } from "@mantine/core";
import { IconGauge, IconSparkles } from "@tabler/icons-react";
import { StepCard } from "../../ui/StepCard";
import { GaPanel } from "./GaPanel";
import { OpsPanel } from "./OpsPanel";
import { useWorkflowContext } from "../../contexts/WorkflowContext";
import { useState } from "react";

enum SelectionMode {
  OPS = "ops",
  GA = "ga",
}

export function SelectionPanel () {
  const { activeDataset, globalBusyState } = useWorkflowContext();
  const isDisabled = !activeDataset || globalBusyState !== "idle";
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(SelectionMode.OPS);

  return (
    <StepCard
      step={3}
      title="Select variables"
      description="Choose the best subset of descriptors for your model"
      isComplete={false}
      disabled={isDisabled}
    >
      {activeDataset ? (
        <Stack gap="md">
          <Paper p="md" radius="sm">
            <Group justify="space-between" align="center" mb="sm">
              <Text size="sm" fw={500}>
                Selection method
              </Text>
              <Badge variant="light" color={selectionMode === SelectionMode.GA ? "grape" : "blue"} leftSection={selectionMode === SelectionMode.GA ? <IconSparkles size="0.8rem" /> : <IconGauge size="0.8rem" />}>
                {selectionMode.toUpperCase()}
              </Badge>
            </Group>
            <SegmentedControl
              fullWidth
              value={selectionMode}
              onChange={(value) => setSelectionMode(value as SelectionMode)}
              data={[
                { label: "OPS", value: SelectionMode.OPS },
                { label: "GA", value: SelectionMode.GA },
              ]}
            />
          </Paper>
          {/* <Text size="sm" c="dimmed">
            OPS and GA are independent selection strategies. Each panel manages its own settings and result summary.
          </Text> */}
          {selectionMode === SelectionMode.GA ? <GaPanel /> : <OpsPanel />}
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">
          Complete preprocessing first to enable variable selection.
        </Text>
      )}
    </StepCard>
  );
}
