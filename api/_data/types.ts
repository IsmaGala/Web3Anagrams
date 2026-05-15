// Server-side Level type — intentionally a copy of the client's `Level` shape
// so the data files copied from src/data can compile without depending on the
// client source tree. The client and server must stay structurally compatible:
// if you add a field to one, add it to the other.

export interface Level {
  theme:      string
  difficulty: number
  letters:    string[]
  words:      string[]
  bonus:      string[]
  defs:       Record<string, string>
}
