import { useCallback, useMemo, useState } from "react";
import { Box, Button, Progress, Badge, Group, Paper, SimpleGrid, Stack, Text } from "@mantine/core";
import { IconAlertCircle, IconGauge, IconListCheck, IconSparkles } from "@tabler/icons-react";
import { NumberFieldWithTooltip } from "../../ui/NumberFieldWithTooltip";
import { ResultCard } from "../../ui/ResultCard";
import { StatsRing } from "../../ui/StatsRing";
import type { GAConfig, GaProgressEvent, GAResult } from "../../../generated";
import { Channel } from '@tauri-apps/api/core';
import { runGaSelectionCmd, gaSendAbort } from "../../../generated";
import { useWorkflowContext } from "../../contexts/WorkflowContext";

const DEFAULT_GA_SETTINGS: GAConfig = {
  populationSize: 100,
  maxGenerations: 300,
  maxStaleGenerations: 50,
  targetFitnessScore: null,
  replacementRate: 0.5,
  elitismRate: 0.02,
  tournamentSize: 4,
  crossoverSelectionRate: 0.7,
  crossoverRate: 0.8,
  mutationProbability: 0.2,
  cvFolds: 5,
  ridgeLambda: 1e-8,
  minFeatures: 1,
  maxFeatures: null,
  sizePenalty: 0.02,
  fitnessPrecision: 1e-6,
  seed: null,
  parFitness: true,
};

function formatScore (value: number | null | undefined) {
  if (value == null || !isFinite(value)) {
    return "N/A";
  }

  return value.toFixed(3);
}

export function GaProgress ({ event } : { event: GaProgressEvent }) {
  return (
    <Paper p="md" radius="sm">
      <Group justify="space-between" align="center" mb="xs">
        <Text size="sm" fw={500}>
          GA progress
        </Text>
        <Badge variant="light" color="grape">
          {event ? `${Math.round(event.progress)}%` : "Idle"}
        </Badge>
      </Group>
      <Progress value={event?.progress ?? 0} size="md" radius="xl" />
      <Group justify="space-between" mt="xs">
        <Text size="xs" c="dimmed">
          Generation {event ? event.currentGeneration + 1 : 0} / {event?.maxGenerations ?? DEFAULT_GA_SETTINGS.maxGenerations}
        </Text>
        <Text size="xs" c="dimmed">
          Stale {event?.staleGenerations ?? 0}
        </Text>
      </Group>
    </Paper>
  );
}

export function GaPanel () {
  const { activeDataset, globalBusyState, setGlobalBusyState } = useWorkflowContext();
  const [settings, setSettings] = useState<GAConfig>(DEFAULT_GA_SETTINGS);
  const [result, setResult] = useState<GAResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<GaProgressEvent | null>(null);

  const maxFeatureCount = activeDataset?.n_features ?? 1;
  const isDisabled = !activeDataset || globalBusyState !== "idle";

  const updateSettings = useCallback((patch: Partial<GAConfig>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const runSelection = useCallback(async () => {
    if (!activeDataset || isDisabled) {
      return;
    }

    try {
      setIsLoading(true);
      setGlobalBusyState("selecting");
      const channel = new Channel<GaProgressEvent>();
      // channel.onmessage = setProgress;
      channel.onmessage = (event: GaProgressEvent) => {
        console.log("Received GA progress event:", event);
        setProgress(event);
      };
      const gaResult = await runGaSelectionCmd({ settings, channel });
      setResult(gaResult);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run GA selection.");
    } finally {
      setIsLoading(false);
      setGlobalBusyState("idle");
      setProgress(null);
    }
  }, [activeDataset, isDisabled, settings, setGlobalBusyState]);

  const summary = useMemo(() => {
    if (!result) {
      return null;
    }

    return (
      <>
        <StatsRing
          stats={[
            {
              label: "Selected",
              stats: result.selectedCount?.toString() ?? "0",
              progress: result.selectedCount ? (result.selectedCount / maxFeatureCount) * 100 : 0,
              color: "grape",
              icon: <IconSparkles size="1.2rem" />,
            },
            {
              label: "Raw Q²",
              stats: formatScore(result.rawCvScore),
              progress: result.rawCvScore != null ? Math.max(0, Math.min(100, result.rawCvScore * 100)) : 0,
              color: "blue",
              icon: <IconGauge size="1.2rem" />,
            },
            {
              label: "Penalized",
              stats: formatScore(result.penalizedScore),
              progress: result.penalizedScore != null ? Math.max(0, Math.min(100, result.penalizedScore * 100)) : 0,
              color: "cyan",
              icon: <IconListCheck size="1.2rem" />,
            },
          ]}
        />
        <Group grow mt="sm">
          <Box>
            <Text size="xs" c="dimmed">
              Fitness score:
            </Text>
            <Text fw={600}>{result.fitnessScore ?? "N/A"}</Text>
          </Box>
          <Box>
            <Text size="xs" c="dimmed">
              Best generation:
            </Text>
            <Text fw={600}>{result.bestGeneration ?? "-"}</Text>
          </Box>
          <Box>
            <Text size="xs" c="dimmed">
              Solution found:
            </Text>
            <Text fw={600}>{result.foundSolution ? "Yes" : "No"}</Text>
          </Box>
        </Group>
      </>
    );
  }, [maxFeatureCount, result]);

  return (
    <Paper p="md" radius="sm">
      <Stack>
        <Group justify="space-between" align="center">
          <Text size="sm" fw={500}>
            GA selection
          </Text>
          <Text size="xs" c="dimmed">
            Evolutionary search workflow
          </Text>
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <NumberFieldWithTooltip
            label="Population size"
            help="Number of chromosomes kept in each GA population."
            value={settings.populationSize}
            min={20}
            max={1000}
            step={10}
            onChange={(v) => updateSettings({ populationSize: v })}
            decimalScale={0}
            fixedDecimalScale={false}
          />
          <NumberFieldWithTooltip
            label="Max generations"
            help="Upper bound on the number of generations the GA can evolve."
            value={settings.maxGenerations}
            min={10}
            max={2000}
            step={10}
            onChange={(v) => updateSettings({ maxGenerations: v })}
            decimalScale={0}
            fixedDecimalScale={false}
          />
          <NumberFieldWithTooltip
            label="Stale generations"
            help="Stop once the GA has not improved for this many generations."
            value={settings.maxStaleGenerations}
            min={1}
            max={1000}
            step={1}
            onChange={(v) => updateSettings({ maxStaleGenerations: v })}
            decimalScale={0}
            fixedDecimalScale={false}
          />
          <NumberFieldWithTooltip
            label="CV folds"
            help="Number of cross-validation folds used to score candidate subsets."
            value={settings.cvFolds}
            min={2}
            max={10}
            step={1}
            onChange={(v) => updateSettings({ cvFolds: v })}
            decimalScale={0}
            fixedDecimalScale={false}
          />
          <NumberFieldWithTooltip
            label="Min features"
            help="Minimum number of selected variables allowed by GA."
            value={settings.minFeatures}
            min={1}
            max={maxFeatureCount}
            step={1}
            onChange={(v) => updateSettings({ minFeatures: v })}
            decimalScale={0}
            fixedDecimalScale={false}
          />
          <NumberFieldWithTooltip
            label="Max features"
            help="Maximum number of selected variables allowed by GA."
            value={settings.maxFeatures ?? maxFeatureCount}
            min={settings.minFeatures}
            max={maxFeatureCount}
            step={1}
            onChange={(v) => updateSettings({ maxFeatures: v })}
            decimalScale={0}
            fixedDecimalScale={false}
          />
        </SimpleGrid>

        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}

        {progress && (
          <GaProgress event={progress} />
        )}

        <Box>
          <Button
            onClick={runSelection}
            disabled={isDisabled}
            loading={isLoading}
            variant="default"
            leftSection={<IconListCheck size="1rem" />}
          >
            Run GA
          </Button>
          {isLoading && (
            <Button
              variant="outline"
              color="red"
              ml="sm"
              leftSection={<IconAlertCircle size="1rem" />}
              onClick={async () => { await gaSendAbort();}}
            >
              Send abort signal
            </Button>
          )}
        </Box>

      </Stack>

      {result && <ResultCard title="GA completed">{summary}</ResultCard>}
    </Paper>
  );
}
