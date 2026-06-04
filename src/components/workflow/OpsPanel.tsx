import { useCallback, useMemo, useState } from "react";
import { Box, Button, Group, Paper, Stack, Text } from "@mantine/core";
import { IconListCheck } from "@tabler/icons-react";
import { ResultCard } from "../ui/ResultCard";
import { SliderFieldWithTooltip } from "../ui/SliderFieldWithTooltip";
import type { OpsConfig, OpsResult } from "../../generated";
import { runSelectionCmd } from "../../generated";
import { useWorkflowContext } from "../contexts/WorkflowContext";

const DEFAULT_OPS_SETTINGS: OpsConfig = {
  latentVarsOps: 3,
  latentVarsModel: 3,
  varsPercentage: 0.5,
  minVarsModel: 2,
};

function formatScore(value: number | null | undefined) {
  if (value == null || !isFinite(value)) {
    return "N/A";
  }

  return value.toFixed(3);
}

export function OpsPanel() {
  const { activeDataset, globalBusyState, setGlobalBusyState } = useWorkflowContext();
  const [settings, setSettings] = useState<OpsConfig>(DEFAULT_OPS_SETTINGS);
  const [result, setResult] = useState<OpsResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxLatentVariables = activeDataset
    ? Math.max(1, Math.min(20, activeDataset.n_samples - 2, activeDataset.n_features))
    : 1;
  const maxFeatureCount = activeDataset?.n_features ?? 1;
  const selectedCount = result ? result.selectedIndices.length : 0;
  const isDisabled = !activeDataset || globalBusyState !== "idle";

  const updateSettings = useCallback((patch: Partial<OpsConfig>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const runSelection = useCallback(async () => {
    if (!activeDataset || isDisabled) {
      return;
    }

    try {
      setIsLoading(true);
      setGlobalBusyState("selecting");
      const opsResult = await runSelectionCmd({ settings });
      setResult(opsResult);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run OPS selection.");
    } finally {
      setIsLoading(false);
      setGlobalBusyState("idle");
    }
  }, [activeDataset, isDisabled, settings, setGlobalBusyState]);

  const resultSummary = useMemo(() => {
    if (!result) {
      return null;
    }

    return (
      <>
        <Group grow>
          <Box>
            <Text size="xs" c="dimmed">
              Selected descriptors:
            </Text>
            <Text fw={600}>{selectedCount}</Text>
          </Box>
          <Box>
            <Text size="xs" c="dimmed">
              Best RMSECV:
            </Text>
            <Text fw={600}>{formatScore(result.bestRmsecv)}</Text>
          </Box>
          <Box>
            <Text size="xs" c="dimmed">
              Evaluation steps:
            </Text>
            <Text fw={600}>{result.evaluationTrace?.length ?? 0}</Text>
          </Box>
        </Group>
        <Group grow mt="sm">
          <Box>
            <Text size="xs" c="dimmed">
              Ranked descriptors:
            </Text>
            <Text fw={600}>{result.rankedIndices?.length ?? 0}</Text>
          </Box>
          <Box>
            <Text size="xs" c="dimmed">
              Latent variables:
            </Text>
            <Text fw={600}>{settings.latentVarsModel}</Text>
          </Box>
          <Box>
            <Text size="xs" c="dimmed">
              Status:
            </Text>
            <Text fw={600}>Completed</Text>
          </Box>
        </Group>
      </>
    );
  }, [result, selectedCount, settings.latentVarsModel]);

  return (
    <Paper p="md" radius="sm">
      <Stack>
        <Group justify="space-between" align="center">
          <Text size="sm" fw={500}>
            OPS selection
          </Text>
          <Text size="xs" c="dimmed">
            Classical ranking workflow
          </Text>
        </Group>

        <Group grow align="flex-start">
          <SliderFieldWithTooltip
            label="Latent variables (OPS)"
            help="Number of latent variables used during OPS ranking. Higher values increase computational cost but may improve robustness."
            value={settings.latentVarsOps}
            min={1}
            max={maxLatentVariables}
            step={1}
            onChange={(v) => updateSettings({ latentVarsOps: v })}
          />
          <SliderFieldWithTooltip
            label="Latent variables (model)"
            help="Number of latent variables (PLS components) used in the final OPS candidate models."
            value={settings.latentVarsModel}
            min={1}
            max={maxLatentVariables}
            step={1}
            onChange={(v) => updateSettings({ latentVarsModel: v })}
          />
        </Group>

        <Group grow align="flex-start">
          <SliderFieldWithTooltip
            label="Variables percentage"
            sliderLabel={(v) => `${Math.round(v * 100)} %`}
            help="Percentage of descriptors to evaluate per OPS step. Lower values reduce the search space but may miss the best subset."
            value={settings.varsPercentage}
            min={0.01}
            max={1}
            step={0.01}
            onChange={(v) => updateSettings({ varsPercentage: v })}
          />
          <SliderFieldWithTooltip
            label="Min vars per model"
            help="Minimum number of descriptors considered for OPS candidate models."
            value={settings.minVarsModel}
            min={1}
            max={maxFeatureCount}
            step={1}
            onChange={(v) => updateSettings({ minVarsModel: v })}
          />
        </Group>

        <Box>
          <Button
            onClick={runSelection}
            disabled={isDisabled}
            loading={isLoading}
            variant="default"
            leftSection={<IconListCheck size="1rem" />}
          >
            Run OPS
          </Button>
        </Box>

        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}
      </Stack>

      {result && <ResultCard title="OPS completed">{resultSummary}</ResultCard>}
    </Paper>
  );
}
