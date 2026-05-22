import { Box, Divider, Group, Text, ThemeIcon } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import type { ReactNode } from "react";

type ResultCardProps = {
  title: string;
  children: ReactNode;
};

export function ResultCard({ title, children }: ResultCardProps) {
  return (
    <Box mt="md">
      <Divider my="sm" />
      <Group gap="xs" mb="sm">
        <ThemeIcon color="green" size="sm" radius="xl" variant="light">
          <IconCheck size="0.8rem" />
        </ThemeIcon>
        <Text size="sm" fw={600} c="green">
          {title}
        </Text>
      </Group>
      <Box>{children}</Box>
    </Box>
  );
}
