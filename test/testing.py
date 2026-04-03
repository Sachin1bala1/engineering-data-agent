import seaborn as sns
import matplotlib.pyplot as plt

correlation_matrix = df.corr()
print("## Correlation Matrix")
print(correlation_matrix.to_markdown(numalign="left", stralign="left"))

# Generate the heatmap (for visualization purposes if this were a notebook)
# plt.figure(figsize=(8, 6))
# sns.heatmap(correlation_matrix, annot=True, cmap='coolwarm', fmt=".2f", linewidths=.5)
# plt.title('Correlation Matrix Heatmap')
# plt.show()