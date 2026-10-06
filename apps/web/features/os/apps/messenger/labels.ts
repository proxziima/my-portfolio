/** A Messenger label with the contact's name in place of each `{name}`. */
// a replacer function inserts the name literally: a string would read `$&`, `$$`… as patterns
export const withName = (label: string, name: string): string => label.replaceAll('{name}', () => name)
