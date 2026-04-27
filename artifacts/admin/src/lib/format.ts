import { format } from "date-fns";
import { getCurrencySymbol } from "./platformConfig";

export const formatCurrency = (amount: number) => {
  return `${getCurrencySymbol()} ${amount.toLocaleString()}`;
};

export const formatDate = (dateString: string) => {
  try {
    return format(new Date(dateString), "MMM d, yyyy h:mm a");
  } catch (e) {
    return dateString;
  }
};

/**
 * Locale-aware date formatter. Uses Intl.DateTimeFormat (timezone-aware)
 * and silently falls back to the raw string on parse failure. Defaults to
 * the user agent's locale so admins in different regions see dates in
 * their own format.
 */
export const formatDateLocale = (
  dateString: string,
  locale: string | undefined = undefined,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
) => {
  try {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return dateString;
    return new Intl.DateTimeFormat(locale, options).format(d);
  } catch {
    return dateString;
  }
};

export const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'pending':
    case 'searching':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'confirmed':
    case 'accepted':
    case 'ongoing':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'preparing':
    case 'arrived':
      return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'out_for_delivery':
    case 'in_transit':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'delivered':
    case 'completed':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'cancelled':
      return 'bg-red-100 text-red-800 border-red-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};
