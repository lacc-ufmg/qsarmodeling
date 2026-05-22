import { Box, Collapse, Divider, Group, Text } from "@mantine/core";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { useState, type ReactNode } from "react";

type ExpandableSectionProps = {
  title: string;
  children: ReactNode;
};

export function ExpandableSection({ title, children }: ExpandableSectionProps) {
  const [opened, setOpened] = useState(false);

  return (
    <Box mt="md">
      <Divider my="sm" />
      <Group
        onClick={() => setOpened((current) => !current)}
        style={{ cursor: "pointer" }}
        gap="xs"
      >
        {opened ? <IconChevronUp size="1.2rem" /> : <IconChevronDown size="1.2rem" />}
        <Text size="sm" fw={500} c="dimmed">
          {title}
        </Text>
      </Group>
      <Collapse in={opened}>
        <Box mt="md">{children}</Box>
      </Collapse>
    </Box>
  );
}
