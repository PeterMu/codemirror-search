import {search, SearchQuery, setSearchQuery, getSearchQuery, openSearchPanel, closeSearchPanel,
        searchPanelOpen} from "@codemirror/search"
import {EditorState, EditorSelection, TransactionSpec} from "@codemirror/state"
import ist from "ist"

// A view that only applies transactions, which is all opening and closing
// the panel need while it has no DOM.
function mkView(doc: string) {
  return {
    state: EditorState.create({doc, extensions: search({literal: true})}),
    dispatch(spec: TransactionSpec) { this.state = this.state.update(spec).state },
    plugin() { return null }
  } as any
}

function scoped(doc: string, from: number, to: number) {
  let view = mkView(doc)
  view.dispatch({effects: setSearchQuery.of(new SearchQuery({search: "n", literal: true, scope: [{from, to}]}))})
  return view
}

function matches(state: EditorState) {
  let cursor = getSearchQuery(state).getCursor(state), found = []
  for (let v; !(v = cursor.next()).done;) found.push(v.value.from)
  return found.join(",")
}

function scope(state: EditorState) {
  return JSON.stringify(getSearchQuery(state).scope?.map(r => [r.from, r.to]))
}

describe("Search scope", () => {
  it("compares scopes by their ranges", () => {
    let a = new SearchQuery({search: "n", scope: [{from: 1, to: 4}]})
    ist(a.eq(new SearchQuery({search: "n", scope: [{from: 1, to: 4}]})))
    ist(!a.eq(new SearchQuery({search: "n", scope: [{from: 1, to: 5}]})))
    ist(!a.eq(new SearchQuery({search: "n"})))
  })

  it("maps the scope through edits", () => {
    let view = scoped("n [n n] n", 2, 7)
    ist(matches(view.state), "3,5")
    view.dispatch({changes: {from: 0, insert: "nn "}})
    ist(scope(view.state), "[[5,10]]")
    ist(matches(view.state), "6,8")
  })

  it("keeps text inserted at the edges outside the scope", () => {
    let view = scoped("n [n n] n", 2, 7)
    view.dispatch({changes: [{from: 2, insert: "n"}, {from: 7, insert: "n"}]})
    ist(scope(view.state), "[[3,8]]")
  })

  it("keeps the replacement of the scope's text inside it", () => {
    let view = scoped("n [n n] n", 2, 7)
    view.dispatch({changes: {from: 2, to: 7, insert: "nnn"}})
    ist(scope(view.state), "[[2,5]]")
    ist(matches(view.state), "2,3,4")
  })

  it("keeps an empty scope empty", () => {
    let view = scoped("n n", 2, 2)
    view.dispatch({changes: {from: 2, insert: "n"}})
    ist(scope(view.state), "[[2,2]]")
    ist(matches(view.state), "")
  })

  it("reads a query set with changes in the changed document", () => {
    let view = scoped("n [n n] n", 2, 7)
    view.dispatch({
      changes: {from: 0, insert: "nn "},
      effects: setSearchQuery.of(new SearchQuery({search: "n", literal: true, scope: [{from: 0, to: 2}]}))
    })
    ist(scope(view.state), "[[0,2]]")
  })

  it("keeps the scope in a query seeded from the selection", () => {
    let view = scoped("n [n n] n", 2, 7)
    view.dispatch({selection: EditorSelection.single(0, 1)})
    openSearchPanel(view)
    ist(searchPanelOpen(view.state))
    ist(getSearchQuery(view.state).search, "n")
    ist(scope(view.state), "[[2,7]]")
  })

  it("keeps a custom test when the scope moves", () => {
    let view = mkView("n [n n] n")
    let test = (_match: string, _state: EditorState, from: number) => from != 8
    view.dispatch({effects: setSearchQuery.of(new SearchQuery({search: "n", literal: true, scope: [{from: 2, to: 7}], test}))})
    view.dispatch({changes: {from: 0, insert: "nn "}})
    ist(getSearchQuery(view.state).test, test)
    ist(matches(view.state), "6")
  })

  it("clears the scope when the panel closes", () => {
    let view = scoped("n [n n] n", 2, 7)
    openSearchPanel(view)
    closeSearchPanel(view)
    ist(!searchPanelOpen(view.state))
    ist(getSearchQuery(view.state).scope, undefined)
    ist(matches(view.state), "0,3,5,8")
  })
})
