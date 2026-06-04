import { Alert, Button, Checkbox, Group, Paper, Stack, Text } from "@mantine/core";
import { IconListCheck, IconPlayerPlay, IconAlertCircle } from "@tabler/icons-react";
import { useCallback, useState } from "react";
import { useWorkflowContext } from "../contexts/WorkflowContext";
import { StepCard } from "../ui/StepCard";
import { ResultCard } from "../ui/ResultCard";
import { ExpandableSection } from "../ui/ExpandableSection";
import { NumberFieldWithTooltip } from "../ui/NumberFieldWithTooltip";

type ValidationResult = {
  cv?: {
    q2: number;
  } | null;
  yr?: {
    score: number;
    passed: boolean;
  } | null;
  lno?: {
    score: number;
    passed: boolean;
  } | null;
  ext?: {
    r2Pred: number;
  } | null;
};

type ValidationSettings = {
  runCrossValidation: boolean;
  runYRandomization: boolean;
  runLNO: boolean;
  runExternalValidation: boolean;
  yrandCutoff: number;
  lnoCutoff: number;
  testSetRatio: number;
};

export function ValidationPanel() {
  const { activeDataset, globalBusyState, setGlobalBusyState } = useWorkflowContext();

  const [validationSettings, setValidationSettings] = useState<ValidationSettings>({
    runCrossValidation: true,
    runYRandomization: true,
    runLNO: true,
    runExternalValidation: false,
    yrandCutoff: 0.05,
    lnoCutoff: 0.1,
    testSetRatio: 0.2,
  });

  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateSettings = useCallback((patch: Partial<ValidationSettings>) => {
    setValidationSettings((s) => ({ ...s, ...patch }));
  }, []);

  const runValidation = useCallback(async () => {
    if (!activeDataset) return;

    try {
      setIsValidating(true);
      setGlobalBusyState("validating");

      // TODO: Implement actual validation command when backend is ready
      // For now, scaffold with mock result to demonstrate flow
      const mockResult: ValidationResult = {
        cv: { q2: 0.0 },
        yr: { score: 0.0, passed: false },
        lno: { score: 0.0, passed: false },
        ext: { r2Pred: 0.0 },
      };
      setValidationResult(mockResult);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to run validation.";
      setError(message);
    } finally {
      setIsValidating(false);
      setGlobalBusyState("idle");
    }
  }, [activeDataset, validationSettings, setGlobalBusyState]);

  const runPipeline = useCallback(async () => {
    if (!activeDataset) return;

    try {
      setIsPipelineRunning(true);

      // TODO: Implement actual pipeline execution when backend is ready
      console.log("Running full pipeline");

      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to run pipeline.";
      setError(message);
    } finally {
      setIsPipelineRunning(false);
    }
  }, [activeDataset]);

  const isDisabled = globalBusyState !== "idle";
  const selectionResult = Boolean(activeDataset); // Placeholder; actual value would come from SelectionPanel
  const canRunPipeline = false; // TODO: Update when pipeline conditions are defined
  return (
    <StepCard
      step={4}
      title="Validate model"
      description="Run validation tests to confirm model quality and stability"
      isComplete={Boolean(validationResult)}
      disabled={isDisabled}
      futurePreview
    >
      {error && (
        <Alert icon={<IconAlertCircle size="1rem" />} color="red">
          {error}
        </Alert>
      )}
      {selectionResult ? (
        <Stack>
          <Paper p="md" radius="sm">
            <Text size="sm" fw={500} mb="sm">
              Choose validation tests
            </Text>
            <Group>
              <Checkbox
                label="Cross validation"
                checked={validationSettings.runCrossValidation}
                onChange={(e) =>
                  updateSettings({ runCrossValidation: e.currentTarget.checked })
                }
              />
              <Checkbox
                label="Y-randomization"
                checked={validationSettings.runYRandomization}
                onChange={(e) =>
                  updateSettings({ runYRandomization: e.currentTarget.checked })
                }
              />
              <Checkbox
                label="Leave-N-Out"
                checked={validationSettings.runLNO}
                onChange={(e) => updateSettings({ runLNO: e.currentTarget.checked })}
              />
              <Checkbox
                label="External validation"
                checked={validationSettings.runExternalValidation}
                onChange={(e) =>
                  updateSettings({ runExternalValidation: e.currentTarget.checked })
                }
              />
            </Group>
          </Paper>

          <ExpandableSection title="Fine-tune thresholds">
            <Group grow>
              <NumberFieldWithTooltip
                label="Y-rand cutoff"
                help="Threshold for Y-randomization test. Models above this are likely overfit."
                value={validationSettings.yrandCutoff}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => updateSettings({ yrandCutoff: v })}
              />
              <NumberFieldWithTooltip
                label="LNO cutoff"
                help="Threshold for Leave-N-Out test. Lower values are stricter; higher values accept more variation."
                value={validationSettings.lnoCutoff}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => updateSettings({ lnoCutoff: v })}
              />
              <NumberFieldWithTooltip
                label="Test set ratio"
                help="Fraction of data to use for external validation."
                value={validationSettings.testSetRatio}
                min={0.1}
                max={0.5}
                step={0.01}
                onChange={(v) => updateSettings({ testSetRatio: v })}
              />
            </Group>
          </ExpandableSection>

          <Group mt="md">
            <Button
              onClick={runValidation}
              disabled={isDisabled}
              loading={isValidating}
              variant="default"
              leftSection={<IconListCheck size="1rem" />}
            >
              Run validation
            </Button>
            <Button
              onClick={runPipeline}
              disabled={!canRunPipeline}
              loading={isPipelineRunning}
              color="orange"
              leftSection={<IconPlayerPlay size="1rem" />}
            >
              Run full pipeline
            </Button>
          </Group>
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">
          Complete variable selection first to enable validation.
        </Text>
      )}

      {validationResult && (
        <ResultCard title="Validation completed">
          <Stack gap="xs" mt="sm">
            {validationResult.cv && (
              <Group justify="space-between">
                <Text size="sm">Cross validation Q²:</Text>
                <Text size="sm" fw={600}>
                  {validationResult.cv.q2.toFixed(3)}
                </Text>
              </Group>
            )}
            {validationResult.yr && (
              <Group justify="space-between">
                <Text size="sm">Y-randomization:</Text>
                <Text
                  size="sm"
                  fw={600}
                  c={validationResult.yr.passed ? "green" : "red"}
                >
                  {validationResult.yr.score.toFixed(3)}{" "}
                  {validationResult.yr.passed ? "✓ PASS" : "✗ FAIL"}
                </Text>
              </Group>
            )}
            {validationResult.lno && (
              <Group justify="space-between">
                <Text size="sm">Leave-N-Out:</Text>
                <Text
                  size="sm"
                  fw={600}
                  c={validationResult.lno.passed ? "green" : "red"}
                >
                  {validationResult.lno.score.toFixed(3)}{" "}
                  {validationResult.lno.passed ? "✓ PASS" : "✗ FAIL"}
                </Text>
              </Group>
            )}
            {validationResult.ext && (
              <Group justify="space-between">
                <Text size="sm">External validation R²pred:</Text>
                <Text size="sm" fw={600}>
                  {validationResult.ext.r2Pred.toFixed(3)}
                </Text>
              </Group>
            )}
          </Stack>
        </ResultCard>
      )}
    </StepCard>
  );
}
