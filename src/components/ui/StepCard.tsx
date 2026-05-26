import { Box, Group, Paper, Text, ThemeIcon, Title } from "@mantine/core";
import { Badge, Tooltip } from "@mantine/core";

import { IconCheck, IconFlask } from "@tabler/icons-react";
import type { ReactNode } from "react";

type StepCardProps = {
  step: number;
  title: string;
  description: string;
  isComplete?: boolean;
  disabled?: boolean;
  futurePreview?: boolean;
  children: ReactNode;
};
const FuturePreviewBadge = () => <Tooltip
  label="This feature is still in development. Bugs are expected."
  withArrow
>
  <Badge variant="light" color="green" size="sm" leftSection={<IconFlask size="1rem" />}>
    Coming soon
  </Badge>
</Tooltip>;

export function StepCard ({
  step,
  title,
  description,
  isComplete = false,
  disabled = false,
  futurePreview = false,
  children,
}: StepCardProps) {
  const hasRightContent = futurePreview || isComplete;

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
        {hasRightContent ? (
          <Group gap="xs">
            {futurePreview && <FuturePreviewBadge />}
            {isComplete ? <IconCheck color="var(--mantine-color-green-6)" /> : null}
          </Group>
        ) : null}
      </Group>
      {children}
    </Paper>
  );
}
