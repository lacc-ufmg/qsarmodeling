import { Box, Button, Group, Stack, Text } from "@mantine/core";
import { IconDatabase, IconUpload, IconLayoutRows, IconLayoutColumns, IconX } from "@tabler/icons-react";
import { StepCard } from "../ui/StepCard";
import { ResultCard } from "../ui/ResultCard";
import type { DatasetProfile } from "../../lib/mockQsarBackend";
import { TooltipLabel } from "../ui/HelpTooltip";
import { StatsRing } from "../ui/StatsRing";

type LoadDataPanelProps = {
  matrixFilePath: string | null;
  vectorFilePath: string | null;
  uploadedDataset: DatasetProfile | null;
  isLoading: boolean;
  isDisabled: boolean;
  onSelectMatrixFile: () => void;
  onSelectVectorFile: () => void;
  onClearMatrixFile: () => void;
  onClearVectorFile: () => void;
  onLoad: () => void;
};

function getFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

export function LoadDataPanel ({
  matrixFilePath,
  vectorFilePath,
  uploadedDataset,
  isLoading,
  isDisabled,
  onSelectMatrixFile,
  onSelectVectorFile,
  onClearMatrixFile,
  onClearVectorFile,
  onLoad,
}: LoadDataPanelProps) {
  return (
    <StepCard
      step={1}
      title="Load your data"
      description="Upload CSV files for the descriptor matrix (X) and target variable (y)"
      isComplete={Boolean(uploadedDataset)}
      disabled={isDisabled && Boolean(uploadedDataset)}
    >
      <Stack>
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
                onClick={onSelectMatrixFile}
                variant="light"
                leftSection={<IconUpload size="1rem" />}
                flex={1}
              >
                Browse
              </Button>
              {matrixFilePath && (
                <Button
                  onClick={onClearMatrixFile}
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
                onClick={onSelectVectorFile}
                variant="light"
                leftSection={<IconUpload size="1rem" />}
                flex={1}
              >
                Browse
              </Button>
              {vectorFilePath && (
                <Button
                  onClick={onClearVectorFile}
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
          <Button
            onClick={onLoad}
            disabled={isDisabled || !matrixFilePath || !vectorFilePath}
            loading={isLoading}
            leftSection={<IconDatabase size="1rem" />}
          >
            Load dataset
          </Button>
        </Box>
      </Stack>

      {uploadedDataset && (
        <ResultCard title="Dataset loaded successfully">
          <StatsRing stats={[
            {
              label: "Samples",
              stats: uploadedDataset.rows.toString(),
              progress: (uploadedDataset.rows / (uploadedDataset.rows + uploadedDataset.descriptors)) * 100,
              color: "blue",
              icon: <IconLayoutRows />,
            },
            {
              label: "Descriptors",
              stats: uploadedDataset.descriptors.toString(),
              progress: (uploadedDataset.descriptors / (uploadedDataset.rows + uploadedDataset.descriptors)) * 100,
              color: "teal",
              icon: <IconLayoutColumns />,
            },
          ]} />
        </ResultCard>
      )}
    </StepCard>
  );
}
