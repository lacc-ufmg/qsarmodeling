import { Box, Group, NumberInput, Slider, Text } from "@mantine/core";
import { HelpTooltip } from "./HelpTooltip";

type SliderFieldWithTooltipProps = {
  label: string;
  help: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  inverted?: boolean;
  sliderLabel?: (value: number) => string;
};

export function SliderFieldWithTooltip({
  label,
  help,
  value,
  min,
  max,
  step,
  onChange,
  inverted,
  sliderLabel = String,
}: SliderFieldWithTooltipProps) {
  return (
    <Box>
      <Group gap="xs" mb="xs">
        <Text size="sm" fw={500}>
          {label}
        </Text>
        <HelpTooltip text={help} />
      </Group>
      <Group gap="md">
        <Slider
          label={sliderLabel}
          inverted={inverted}
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={onChange}
          style={{ flex: 1 }}
        />
        <NumberInput
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(val) => onChange(Number(val) || 0)}
          w={72}
          fixedDecimalScale
          allowedDecimalSeparators={[".", ","]}
        />
      </Group>
    </Box>
  );
}
