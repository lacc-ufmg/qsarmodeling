import { Stack, Text } from "@mantine/core";
import { StepCard } from "../ui/StepCard";
import { GaPanel } from "./GaPanel";
import { OpsPanel } from "./OpsPanel";
import { useWorkflowContext } from "./WorkflowContext";

export function SelectionPanel() {
  const { activeDataset, globalBusyState } = useWorkflowContext();
  const isDisabled = !activeDataset || globalBusyState !== "idle";

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
          <Text size="sm" c="dimmed">
            OPS and GA are independent selection strategies. Each panel manages its own settings and result summary.
          </Text>
          <OpsPanel />
          <GaPanel />
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">
          Complete preprocessing first to enable variable selection.
        </Text>
      )}
    </StepCard>
  );
}
