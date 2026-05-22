import { Box, Button, FileInput, Group, Stack, Text } from "@mantine/core";
import { IconDatabase, IconUpload } from "@tabler/icons-react";
import { StepCard } from "../ui/StepCard";
import { ResultCard } from "../ui/ResultCard";
import type { DatasetProfile } from "../../lib/mockQsarBackend";

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
            label="X matrix (.csv)"
            placeholder="Choose file"
            accept=".csv"
            value={matrixFile}
            onChange={onMatrixFileChange}
            leftSection={<IconUpload size="1rem" />}
          />
          <FileInput
            label="y vector (.csv)"
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
          <Group grow>
            <Box>
              <Text size="xs" c="dimmed">
                Rows:
              </Text>
              <Text fw={600}>{uploadedDataset.rows}</Text>
            </Box>
            <Box>
              <Text size="xs" c="dimmed">
                Descriptors:
              </Text>
              <Text fw={600}>{uploadedDataset.descriptors}</Text>
            </Box>
            <Box>
              <Text size="xs" c="dimmed">
                Files:
              </Text>
              <Text fw={600} size="sm">
                {uploadedDataset.matrixName}, {uploadedDataset.vectorName}
              </Text>
            </Box>
          </Group>
        </ResultCard>
      )}
    </StepCard>
  );
}
