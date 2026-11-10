export const campaignPolicy20271 = {
  period: '2027.1', regular: 307, prouni: [204, 235, 245], includeMedicine: false,
  source: 'Politica_Bonificacao_Unieuro_2027_1_Final.pdf',
  monthly: [
    { month: '2026-10', label: 'Outubro', targets: [4, 5, 6, 8] },
    { month: '2026-11', label: 'Novembro', targets: [11, 13, 14, 16] },
    { month: '2026-12', label: 'Dezembro', targets: [24, 27, 29, 33] },
    { month: '2027-01', label: 'Janeiro', targets: [74, 85, 89, 103] },
    { month: '2027-02', label: 'Fevereiro', targets: [124, 143, 149, 174] },
    { month: '2027-03', label: 'Março', targets: [69, 80, 83, 97] },
  ],
}

export const regularMonthlyDifference = campaignPolicy20271.regular - campaignPolicy20271.monthly.reduce((sum, month) => sum + month.targets[0], 0)
