/** A Messenger label with the contact's name in place of each `{name}`. */
export const withName = (label: string, name: string): string => label.replaceAll('{name}', name)
