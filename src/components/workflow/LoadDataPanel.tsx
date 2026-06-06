import { Alert, Box, Button, Group, Stack, Text, Menu } from "@mantine/core";
import { IconDatabase, IconUpload, IconLayoutRows, IconLayoutColumns, IconX, IconChevronDown, IconAlertCircle } from "@tabler/icons-react";
import { useCallback, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { loadDatasetCmd, loadExampleDatasetCmd, type ExampleDataset } from "../../generated";
import { useWorkflowContext } from "../contexts/WorkflowContext";
import { StepCard } from "../ui/StepCard";
import { ResultCard } from "../ui/ResultCard";
import { TooltipLabel } from "../ui/HelpTooltip";
import { StatsRing } from "../ui/StatsRing";

function getFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function LoadDataPanel() {
  const { uploadedDataset, setUploadedDataset, setActiveDataset, globalBusyState, setGlobalBusyState } = useWorkflowContext();

  const [matrixFilePath, setMatrixFilePath] = useState<string | null>(null);
  const [vectorFilePath, setVectorFilePath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectMatrixFile = useCallback(async () => {
    try {
      const selected = await open({ multiple: false, filters: [{ name: "CSV", extensions: ["csv"] }] });
      if (selected && typeof selected === "string") setMatrixFilePath(selected);
    } catch (err) {
      setError(toErrorMessage(err, "Failed to select matrix file."));
    }
  }, []);

  const selectVectorFile = useCallback(async () => {
    try {
      const selected = await open({ multiple: false, filters: [{ name: "CSV", extensions: ["csv"] }] });
      if (selected && typeof selected === "string") setVectorFilePath(selected);
    } catch (err) {
      setError(toErrorMessage(err, "Failed to select vector file."));
    }
  }, []);

  const clearMatrixFile = useCallback(() => setMatrixFilePath(null), []);
  const clearVectorFile = useCallback(() => setVectorFilePath(null), []);

  const loadData = useCallback(async () => {
    if (!matrixFilePath || !vectorFilePath) {
      setError("Select both X matrix and y vector files before loading.");
      return;
    }

    try {
      setIsLoading(true);
      setGlobalBusyState("loading-data");
      const meta = await loadDatasetCmd({ xPath: matrixFilePath, yPath: vectorFilePath });

      setUploadedDataset(meta);
      setActiveDataset(meta);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err, "Failed to load dataset."));
    } finally {
      setIsLoading(false);
      setGlobalBusyState("idle");
    }
  }, [matrixFilePath, vectorFilePath, setUploadedDataset, setActiveDataset, setGlobalBusyState]);

  const loadExample = useCallback(async (name: ExampleDataset) => {
    try {
      setIsLoading(true);
      setGlobalBusyState("loading-data");

      const meta = await loadExampleDatasetCmd({ dataset: name });

      setUploadedDataset(meta);
      setActiveDataset(meta);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err, "Failed to load example dataset."));
    } finally {
      setIsLoading(false);
      setGlobalBusyState("idle");
    }
  }, [setUploadedDataset, setActiveDataset, setGlobalBusyState]);

  const isDisabled = globalBusyState !== "idle";
  return (
    <StepCard
      step={1}
      title="Load your data"
      description="Upload CSV files for the descriptor matrix (X) and target variable (y)"
      isComplete={Boolean(uploadedDataset)}
      disabled={false}
    >
      <Stack>
        {error && (
          <Alert icon={<IconAlertCircle size="1rem" />} color="red">
            {error}
          </Alert>
        )}
        <Group grow>
          <Stack gap="xs">
            <div>
              <TooltipLabel
                label="Structural descriptors matrix (X.csv)"
                help="Select the CSV file containing the descriptor matrix. Each row should correspond to a chemical compound, and each column should represent a descriptor. The file should not contain the target variable (y) or any non-numeric data. X should have the same number of rows as the y vector file."
              />
            </div>
            <Group gap="xs">
              <Button
                onClick={selectMatrixFile}
                variant="light"
                leftSection={<IconUpload size="1rem" />}
                flex={1}
              >
                Browse
              </Button>
              {matrixFilePath && (
                <Button
                  onClick={clearMatrixFile}
                  variant="subtle"
                  color="red"
                  size="xs"
                  leftSection={<IconX size="1rem" />}
                />
              )}
            </Group>
            {matrixFilePath && (
              <Text size="sm" c="dimmed" truncate>
                {getFileName(matrixFilePath)}
              </Text>
            )}
          </Stack>
          <Stack gap="xs">
            <div>
              <TooltipLabel
                label="Activity vector (y.csv)"
                help="Select the CSV file containing the target variable (y). Each row should correspond to a chemical compound on X, and the value should be a number representing the activity or property you want to predict. y should have the same number of rows as the X matrix file."
              />
            </div>
            <Group gap="xs">
              <Button
                onClick={selectVectorFile}
                variant="light"
                leftSection={<IconUpload size="1rem" />}
                flex={1}
              >
                Browse
              </Button>
              {vectorFilePath && (
                <Button
                  onClick={clearVectorFile}
                  variant="subtle"
                  color="red"
                  size="xs"
                  leftSection={<IconX size="1rem" />}
                />
              )}
            </Group>
            {vectorFilePath && (
              <Text size="sm" c="dimmed" truncate>
                {getFileName(vectorFilePath)}
              </Text>
            )}
          </Stack>
        </Group>
        <Box>
          <Group>
            <Button
              onClick={loadData}
              disabled={isDisabled || !matrixFilePath || !vectorFilePath}
              loading={isLoading}
              leftSection={<IconDatabase size="1rem" />}
            >
              Load dataset
            </Button>

            <Menu withinPortal position="bottom-end">
              <Menu.Target>
                <Button rightSection={<IconChevronDown size="1rem" />} variant="outline">
                  Examples
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => loadExample("Dream")}>
                  Dream
                </Menu.Item>
                <Menu.Item onClick={() => loadExample("Carbox")}>
                  Carbox
                </Menu.Item>
                <Menu.Item onClick={() => loadExample("CarboxBig")}>
                  Carbox (big)
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Box>
      </Stack>

      {uploadedDataset && (
        <ResultCard title="Dataset loaded successfully">
          <StatsRing stats={[
            {
              label: "Samples",
              stats: uploadedDataset.n_samples.toString(),
              progress: (uploadedDataset.n_samples / (uploadedDataset.n_samples + uploadedDataset.n_features)) * 100,
              color: "blue",
              icon: <IconLayoutRows />,
            },
            {
              label: "Descriptors",
              stats: uploadedDataset.n_features.toString(),
              progress: (uploadedDataset.n_features / (uploadedDataset.n_samples + uploadedDataset.n_features)) * 100,
              color: "teal",
              icon: <IconLayoutColumns />,
            },
          ]} />
        </ResultCard>
      )}
    </StepCard>
  );
}
