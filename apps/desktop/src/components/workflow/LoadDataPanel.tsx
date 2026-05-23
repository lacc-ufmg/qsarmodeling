import { Box, Button, FileInput, Group, Stack, Text } from "@mantine/core";
import { IconDatabase, IconUpload } from "@tabler/icons-react";
import { StepCard } from "../ui/StepCard";
import { ResultCard } from "../ui/ResultCard";
import type { DatasetProfile } from "../../lib/mockQsarBackend";
import { TooltipLabel } from "../ui/HelpTooltip";

type LoadDataPanelProps = {
  matrixFile: File | null;
  vectorFile: File | null;
  uploadedDataset: DatasetProfile | null;
  isLoading: boolean;
  isDisabled: boolean;
  onMatrixFileChange: (file: File | null) => void;
  onVectorFileChange: (file: File | null) => void;
  onLoad: () => void;
};

export function LoadDataPanel({
  matrixFile,
  vectorFile,
  uploadedDataset,
  isLoading,
  isDisabled,
  onMatrixFileChange,
  onVectorFileChange,
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
          <FileInput
            label={
              <TooltipLabel
                label="Structural descriptors matrix (X.csv)"
                help="Upload the CSV file containing the descriptor matrix. Each row should correspond to a chemical compound, and each column should represent a descriptor. The file should not contain the target variable (y) or any non-numeric data. X should have the same number of rows as the y vector file."
              />
            }
            placeholder="Choose file"
            accept=".csv"
            value={matrixFile}
            onChange={onMatrixFileChange}
            leftSection={<IconUpload size="1rem" />}
          />
          <FileInput
            label={
              <TooltipLabel
                label="Activity vector (y.csv)"
                help="Upload the CSV file containing the target variable (y). Each row should correspond to a chemical compound on X, and the value should be a number representing the activity or property you want to predict. y should have the same number of rows as the X matrix file."
              />
            }
            placeholder="Choose file"
            accept=".csv"
            value={vectorFile}
            onChange={onVectorFileChange}
            leftSection={<IconUpload size="1rem" />}
          />
        </Group>
        <Box>
          <Button
            onClick={onLoad}
            disabled={isDisabled}
            loading={isLoading}
            leftSection={<IconDatabase size="1rem" />}
          >
            Load dataset
          </Button>
        </Box>
      </Stack>

      {uploadedDataset && (
        <ResultCard title="Dataset loaded successfully">
          <Group justify="space-evenly" align="center">
            <Box style={{textAlign: "center"}}>
              <Text size="xs" c="dimmed">
                Loaded rows ({uploadedDataset.matrixName}, {uploadedDataset.vectorName})
              </Text>
              <Text fw={600}>{uploadedDataset.rows} samples</Text>
            </Box>
            <Box style={{textAlign: "center"}}>
              <Text size="xs" c="dimmed">
                Loaded columns ({uploadedDataset.matrixName})
              </Text>
              <Text fw={600}>{uploadedDataset.descriptors} features</Text>
            </Box>
          </Group>
        </ResultCard>
      )}
    </StepCard>
  );
}
