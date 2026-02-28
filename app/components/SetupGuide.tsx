import { useState, useId } from "react";
import {
  BlockStack,
  Card,
  Text,
  InlineStack,
  ButtonGroup,
  Button,
  ProgressBar,
  Box,
  Collapsible,
  Tooltip,
  Spinner,
  Icon,
  Popover,
  ActionList,
} from "@shopify/polaris";
import {
  MenuHorizontalIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CheckIcon,
  XIcon,
} from "@shopify/polaris-icons";

export interface SetupGuideItem {
  id: number;
  title: string;
  description: string;
  complete: boolean;
  primaryButton?: {
    content: string;
    props: Record<string, any>;
  };
  secondaryButton?: {
    content: string;
    props: Record<string, any>;
  };
  image?: {
    url: string;
    alt?: string;
  };
}

interface SetupGuideProps {
  onDismiss: () => void;
  onStepComplete: (id: number) => Promise<void>;
  items: SetupGuideItem[];
}

export function SetupGuide({ onDismiss, onStepComplete, items }: SetupGuideProps) {
  const [expanded, setExpanded] = useState(
    items.findIndex((item) => !item.complete)
  );
  const [isGuideOpen, setIsGuideOpen] = useState(true);
  const [popoverActive, setPopoverActive] = useState(false);
  const accessId = useId();
  const completedItemsLength = items.filter((item) => item.complete).length;

  return (
    <Card padding="0">
      <Box padding="400" paddingBlockEnd="400">
        <BlockStack>
          <InlineStack align="space-between" blockAlign="center">
            <Text as="h3" variant="headingMd">
              Setup Guide
            </Text>
            <ButtonGroup gap="tight" noWrap>
              <Popover
                active={popoverActive}
                onClose={() => setPopoverActive((prev) => !prev)}
                activator={
                  <Button
                    onClick={() => setPopoverActive((prev) => !prev)}
                    variant="tertiary"
                    icon={MenuHorizontalIcon}
                  />
                }
              >
                <ActionList
                  actionRole="menuitem"
                  items={[
                    {
                      content: "Dismiss",
                      onAction: onDismiss,
                      prefix: (
                        <div
                          style={{
                            height: "1rem",
                            width: "1rem",
                            paddingTop: ".05rem",
                          }}
                        >
                          <Icon tone="subdued" source={XIcon} />
                        </div>
                      ),
                    },
                  ]}
                />
              </Popover>

              <Button
                variant="tertiary"
                icon={isGuideOpen ? ChevronUpIcon : ChevronDownIcon}
                onClick={() => {
                  setIsGuideOpen((prev) => {
                    if (!prev)
                      setExpanded(items.findIndex((item) => !item.complete));
                    return !prev;
                  });
                }}
                ariaControls={accessId}
              />
            </ButtonGroup>
          </InlineStack>
          <Text as="p" variant="bodyMd">
            Use this personalized guide to get your app up and running.
          </Text>
          <div style={{ marginTop: ".8rem" }}>
            <InlineStack blockAlign="center" gap="200">
              {completedItemsLength === items.length ? (
                <div style={{ maxHeight: "1rem" }}>
                  <InlineStack wrap={false} gap="100">
                    <Icon source={CheckIcon} tone="subdued" />
                    <Text as="p" variant="bodySm" tone="subdued">
                      Done
                    </Text>
                  </InlineStack>
                </div>
              ) : (
                <Text as="span" variant="bodySm">
                  {`${completedItemsLength} / ${items.length} completed`}
                </Text>
              )}

              {completedItemsLength !== items.length ? (
                <div style={{ width: "100px" }}>
                  <ProgressBar
                    progress={
                      (items.filter((item) => item.complete).length /
                        items.length) *
                      100
                    }
                    size="small"
                    tone="primary"
                    animated
                  />
                </div>
              ) : null}
            </InlineStack>
          </div>
        </BlockStack>
      </Box>
      <Collapsible open={isGuideOpen} id={accessId}>
        <Box padding="200">
          <BlockStack gap="100">
            {items.map((item) => (
              <SetupItem
                key={item.id}
                expanded={expanded === item.id}
                setExpanded={() => setExpanded(item.id)}
                onComplete={onStepComplete}
                {...item}
              />
            ))}
          </BlockStack>
        </Box>
      </Collapsible>
      {completedItemsLength === items.length ? (
        <Box
          background="bg-surface-secondary"
          borderBlockStartWidth="025"
          borderColor="border-secondary"
          padding="300"
        >
          <InlineStack align="end">
            <Button onClick={onDismiss}>Dismiss Guide</Button>
          </InlineStack>
        </Box>
      ) : null}
    </Card>
  );
}

function SetupItem({
  complete,
  onComplete,
  expanded,
  setExpanded,
  title,
  description,
  primaryButton,
  secondaryButton,
  id,
}: SetupGuideItem & {
  expanded: boolean;
  setExpanded: () => void;
  onComplete: (id: number) => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);

  const completeItem = async () => {
    setLoading(true);
    await onComplete(id);
    setLoading(false);
  };

  return (
    <Box borderRadius="200" background={expanded ? "bg-surface-active" : undefined}>
      <div
        style={{
          padding: "0.25rem 0.5rem",
          borderRadius: "0.5rem",
        }}
      >
        <InlineStack gap="200" align="start" blockAlign="start" wrap={false}>
          <Tooltip
            content={complete ? "Mark as not done" : "Mark as done"}
            activatorWrapper="div"
          >
            <Button onClick={completeItem} variant="monochromePlain">
              <div
                style={{
                  width: "1.5rem",
                  height: "1.5rem",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  color: "#303030",
                }}
              >
                {loading ? (
                  <Spinner size="small" />
                ) : complete ? (
                  <div
                    style={{
                      width: "1.25rem",
                      height: "1.25rem",
                      borderRadius: "100%",
                      background: "#303030",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Icon source={CheckIcon} tone="inverse" />
                  </div>
                ) : (
                  <div
                    style={{
                      width: "1.25rem",
                      height: "1.25rem",
                      borderRadius: "100%",
                      border: "2px solid #8A8A8A",
                    }}
                  />
                )}
              </div>
            </Button>
          </Tooltip>
          <div
            onClick={expanded ? undefined : setExpanded}
            style={{
              cursor: expanded ? "default" : "pointer",
              paddingTop: ".15rem",
              width: "100%",
            }}
          >
            <BlockStack gap="300">
              <Text as="h4" variant={expanded ? "headingSm" : "bodyMd"}>
                {title}
              </Text>
              <Collapsible open={expanded} id={String(id)}>
                <Box paddingBlockEnd="150" paddingInlineEnd="150">
                  <BlockStack gap="400">
                    <Text as="p" variant="bodyMd">
                      {description}
                    </Text>
                    {primaryButton || secondaryButton ? (
                      <ButtonGroup gap="loose">
                        {primaryButton ? (
                          <Button variant="primary" {...primaryButton.props}>
                            {primaryButton.content}
                          </Button>
                        ) : null}
                        {secondaryButton ? (
                          <Button variant="tertiary" {...secondaryButton.props}>
                            {secondaryButton.content}
                          </Button>
                        ) : null}
                      </ButtonGroup>
                    ) : null}
                  </BlockStack>
                </Box>
              </Collapsible>
            </BlockStack>
          </div>
        </InlineStack>
      </div>
    </Box>
  );
}
