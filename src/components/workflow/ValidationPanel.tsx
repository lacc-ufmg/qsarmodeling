import { Button, Checkbox, Group, Paper, Stack, Text } from "@mantine/core";
import { IconListCheck, IconPlayerPlay } from "@tabler/icons-react";
import { StepCard } from "../ui/StepCard";
import { ResultCard } from "../ui/ResultCard";
import { ExpandableSection } from "../ui/ExpandableSection";
import { NumberFieldWithTooltip } from "../ui/NumberFieldWithTooltip";
import type { ValidationResult, ValidationSettings } from "../../lib/mockQsarBackend";

type ValidationPanelProps = {
  selectionResult: boolean;
  validationResult: ValidationResult | null;
  validationSettings: ValidationSettings;
  isLoading: boolean;
  isValidating: boolean;
  isPipelineRunning: boolean;
  isDisabled: boolean;
  canRunPipeline: boolean;
  onSettingsChange: (patch: Partial<ValidationSettings>) => void;
  onRunValidation: () => void;
  onRunPipeline: () => void;
};

export function ValidationPanel({
  selectionResult,
  validationResult,
  validationSettings,
  isLoading: _isLoading,
  isValidating,
  isPipelineRunning,
  isDisabled,
  canRunPipeline,
  onSettingsChange,
  onRunValidation,
  onRunPipeline,
}: ValidationPanelProps) {
  return (
    <StepCard
      step={4}
      title="Validate model"
      description="Run validation tests to confirm model quality and stability"
      isComplete={Boolean(validationResult)}
      disabled={isDisabled}
      futurePreview
    >
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
                  onSettingsChange({ runCrossValidation: e.currentTarget.checked })
                }
              />
              <Checkbox
                label="Y-randomization"
                checked={validationSettings.runYRandomization}
                onChange={(e) =>
                  onSettingsChange({ runYRandomization: e.currentTarget.checked })
                }
              />
              <Checkbox
                label="Leave-N-Out"
                checked={validationSettings.runLNO}
                onChange={(e) => onSettingsChange({ runLNO: e.currentTarget.checked })}
              />
              <Checkbox
                label="External validation"
                checked={validationSettings.runExternalValidation}
                onChange={(e) =>
                  onSettingsChange({ runExternalValidation: e.currentTarget.checked })
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
                onChange={(v) => onSettingsChange({ yrandCutoff: v })}
              />
              <NumberFieldWithTooltip
                label="LNO cutoff"
                help="Threshold for Leave-N-Out test. Lower values are stricter; higher values accept more variation."
                value={validationSettings.lnoCutoff}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => onSettingsChange({ lnoCutoff: v })}
              />
              <NumberFieldWithTooltip
                label="Test set ratio"
                help="Fraction of data to use for external validation."
                value={validationSettings.testSetRatio}
                min={0.1}
                max={0.5}
                step={0.01}
                onChange={(v) => onSettingsChange({ testSetRatio: v })}
              />
            </Group>
          </ExpandableSection>

          <Group mt="md">
            <Button
              onClick={onRunValidation}
              disabled={isDisabled}
              loading={isValidating}
              variant="default"
              leftSection={<IconListCheck size="1rem" />}
            >
              Run validation
            </Button>
            <Button
              onClick={onRunPipeline}
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
