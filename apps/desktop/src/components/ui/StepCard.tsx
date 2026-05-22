import { Box, Group, Paper, Text, ThemeIcon, Title } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import type { ReactNode } from "react";

type StepCardProps = {
  step: number;
  title: string;
  description: string;
  isComplete?: boolean;
  disabled?: boolean;
  children: ReactNode;
};

export function StepCard({
  step,
  title,
  description,
  isComplete = false,
  disabled = false,
  children,
}: StepCardProps) {
  return (
    <Paper withBorder p="lg" radius="md" shadow="sm" opacity={disabled ? 0.5 : 1}>
      <Group justify="space-between" mb="md">
        <Group>
          <ThemeIcon size="lg" radius="xl" variant="light" color="blue">
            {step}
          </ThemeIcon>
          <Box>
            <Title order={3}>{title}</Title>
            <Text size="sm" c="dimmed">
              {description}
            </Text>
          </Box>
        </Group>
        {isComplete ? <IconCheck color="var(--mantine-color-green-6)" /> : null}
      </Group>
      {children}
    </Paper>
  );
}
