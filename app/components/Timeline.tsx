import {
  BlockStack,
  Box,
  Icon,
  InlineGrid,
  InlineStack,
  Link,
  Text,
} from "@shopify/polaris";
import { Fragment, type ReactNode } from "react";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  CircleChevronRightIcon,
} from "@shopify/polaris-icons";

export interface TimelineItem {
  tone?: "critical" | "caution" | "success" | "base";
  url?: string;
  icon?: ReactNode;
  timelineEvent: ReactNode;
  timestamp: Date;
}

interface TimelineProps {
  items: TimelineItem[];
}

function getBulletIconFromTone(tone?: string) {
  switch (tone) {
    case "critical":
    case "caution":
      return AlertCircleIcon;
    case "success":
      return CheckCircleIcon;
    case "base":
    case undefined:
      return null;
    default:
      return CircleChevronRightIcon;
  }
}

export function Timeline({ items }: TimelineProps) {
  let lastDate: string | null = null;

  return (
    <Box paddingInline={{ xs: "300", md: "0" }}>
      <BlockStack gap="300">
        {items?.length ? (
          items.map((item, index) => {
            const currentDate = item.timestamp.toLocaleDateString([], {
              year: "numeric",
              month: "long",
              day: "numeric",
            });
            const showDate = currentDate !== lastDate;
            lastDate = currentDate;
            const bulletIcon = getBulletIconFromTone(item.tone);

            return (
              <Fragment key={index}>
                {showDate && (
                  <InlineGrid gap="200" columns="30px auto 90px">
                    <div>&nbsp;</div>
                    <BlockStack gap="0">
                      <Box paddingBlockStart="600">
                        <Text
                          alignment="start"
                          as="h2"
                          variant="bodySm"
                          tone="subdued"
                        >
                          {currentDate}
                        </Text>
                      </Box>
                    </BlockStack>
                    <div>&nbsp;</div>
                  </InlineGrid>
                )}

                <InlineGrid
                  gap="200"
                  columns="30px auto 90px"
                  alignItems="center"
                >
                  <div style={styles.timelineIcon}>
                    {item.tone === "base" || !bulletIcon ? (
                      <div style={styles.timelineIconBase}>
                        <div style={styles.timelineIconBaseInner} />
                      </div>
                    ) : (
                      <span style={styles.timelineIconPolarisIcon}>
                        <Icon source={bulletIcon} tone={item.tone} />
                      </span>
                    )}
                  </div>
                  <Box>
                    <InlineStack gap="200" wrap={false} blockAlign="center">
                      {item.icon}
                      {item.url ? (
                        <Link url={item.url} monochrome removeUnderline>
                          <InlineStack
                            gap="0"
                            wrap={false}
                            blockAlign="start"
                          >
                            <Box>{item.timelineEvent}</Box>
                            <Icon source={ChevronRightIcon} />
                          </InlineStack>
                        </Link>
                      ) : (
                        <Box>{item.timelineEvent}</Box>
                      )}
                    </InlineStack>
                  </Box>
                  <Text as="p" alignment="end" tone="subdued" variant="bodySm">
                    {item.timestamp.toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </Text>
                </InlineGrid>
              </Fragment>
            );
          })
        ) : (
          <Text as="p">No timeline events available.</Text>
        )}
      </BlockStack>
    </Box>
  );
}

const styles: Record<string, React.CSSProperties> = {
  timelineIcon: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: 24,
    width: 24,
    marginRight: 10,
  },
  timelineIconPolarisIcon: {
    zIndex: 1,
  },
  timelineIconBase: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    width: 16,
    height: 16,
    backgroundColor: "var(--p-color-border)",
    borderRadius: 3,
    zIndex: 1,
  },
  timelineIconBaseInner: {
    width: 8,
    height: 8,
    backgroundColor: "var(--p-color-icon)",
    borderRadius: 3,
  },
};
